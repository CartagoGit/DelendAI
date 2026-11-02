#!/usr/bin/env bun

/**
 * config-jsonc-only — `delendai.config.json` is read as JSONC, always.
 *
 * The configuration file is JSONC by contract
 * (`packages/core/src/lib/config/jsonc-document.ts`): it may carry
 * comments and trailing commas, and every reader is expected to accept
 * them. That contract only holds while every reader actually honours
 * it, and a reader that reaches for `JSON.parse` silently breaks the
 * moment a human adds the first `//` to their own file.
 *
 * A lint is the right enforcement here because the failure is silent:
 * the reader throws, the caller swallows the error, and the symptom
 * lands somewhere else entirely (a project that "declares" a branch it
 * never declared, a plugin that looks "not configured" while the
 * config plainly configures it). A test would have to be written per
 * reader; the rule is one sentence and belongs in one place.
 *
 * The scan looks at the argument of every `JSON.parse(` call and flags
 * the ones that mention the config file. A `JSON.parse` of something
 * else — a `package.json`, a CLI value expression, a cache record — is
 * left alone: the file format it reads really is strict JSON.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';
import { refuseMissingScanRoots } from './lib/scan-roots.lib';

/** The roots that hold source that can read the config file. */
const SCAN_ROOTS = ['packages', 'plugins', 'tools', 'apps', 'bin'] as const;

/** Directories that hold build output or vendored code, never sources. */
const SKIPPED_DIRS = new Set([
	'.cache',
	'.git',
	'coverage',
	'dist',
	'node_modules',
]);

/** Tests assert behaviour; they may parse JSON strictly on purpose. */
const SKIPPED_FILE = /\.(spec|test)\.[cm]?[jt]s$/u;

/**
 * What makes a `JSON.parse` call a config read.
 *
 * The window is the call's own argument, so an unrelated `JSON.parse`
 * in the same file is not reported — only the parse that would choke
 * on a comment.
 */
const CONFIG_REFERENCE =
	/delendai\.config\.json|CONFIG_FILENAME|configText|configRaw|existingText/u;

/** How far past `JSON.parse(` the argument may reach. */
const ARGUMENT_WINDOW = 240;

export interface IViolation {
	readonly file: string;
	readonly line: number;
	readonly snippet: string;
}

/** One source file, as text. */
export interface ISourceFile {
	readonly file: string;
	readonly text: string;
}

/**
 * The violations in one file.
 *
 * Pure and file-system free so the rule can be tested against a
 * fixture instead of against the repository it lives in.
 */
export const findViolations = (source: ISourceFile): readonly IViolation[] => {
	const violations: IViolation[] = [];
	let index = source.text.indexOf('JSON.parse(');
	while (index !== -1) {
		const window = source.text.slice(index, index + ARGUMENT_WINDOW);
		if (CONFIG_REFERENCE.test(window)) {
			const line = source.text.slice(0, index).split('\n').length;
			violations.push({
				file: source.file,
				line,
				snippet: window.split('\n')[0]?.trim() ?? '',
			});
		}
		index = source.text.indexOf('JSON.parse(', index + 1);
	}
	return violations;
};

const sourceFiles = (dir: string): string[] => {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	const found: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry);
		let isDirectory: boolean;
		try {
			isDirectory = statSync(full).isDirectory();
		} catch {
			continue;
		}
		if (isDirectory) {
			if (SKIPPED_DIRS.has(entry)) continue;
			found.push(...sourceFiles(full));
			continue;
		}
		if (!/\.[cm]?[jt]s$/u.test(entry)) continue;
		if (SKIPPED_FILE.test(entry)) continue;
		found.push(full);
	}
	return found;
};

const violationsIn = (file: string): readonly IViolation[] =>
	findViolations({ file, text: readFileSync(file, 'utf8') });

const main = (): number => {
	const root = repoRoot();
	// A tree without the sources measures nothing; passing over it would
	// read as "every reader goes through parseJsonc".
	if (
		refuseMissingScanRoots('config-jsonc-only', root, [
			'packages',
			'plugins',
		])
	)
		return 1;
	const violations: IViolation[] = [];
	for (const scanRoot of SCAN_ROOTS) {
		for (const file of sourceFiles(join(root, scanRoot))) {
			violations.push(...violationsIn(file));
		}
	}

	if (violations.length === 0) {
		console.log(
			'✓ config-jsonc-only: no `JSON.parse` reads `delendai.config.json` — every reader goes through `parseJsonc`.',
		);
		return 0;
	}

	console.error(
		'✖ config-jsonc-only: `delendai.config.json` is JSONC by contract, but these reads use `JSON.parse`:\n' +
			violations
				.map(
					(v) =>
						`  ${relative(root, v.file).split(sep).join('/')}:${String(v.line)}  ${v.snippet}`,
				)
				.join('\n') +
			'\n\n  A commented config is a valid config. Read it with `parseJsonc`\n' +
			'  (`@delendai/core/cli` for the CLI and the plugins).\n',
	);
	return 1;
};

// The entrypoint is guarded so a spec can import the pure rule above
// without running the gate (and exiting the test process) on import.
if (import.meta.main) process.exit(main());
