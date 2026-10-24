#!/usr/bin/env bun
/**
 * web-absolute-api-urls.script.ts — gate for the site's base path.
 *
 * The site deploys to GitHub Pages under a base path (`/delendai` by
 * default, overridable with PAGES_BASE). A URL written as `/api/...` in
 * client code resolves against the DOMAIN root, not the site root, so it
 * 404s in production while working perfectly in local dev, where the
 * base is empty. That asymmetry is why it survived: the bug is invisible
 * exactly where it would be noticed.
 *
 * Two of these shipped — the EventSource calls on the status/logs and
 * status/recovery pages — while every other link on the site already
 * went through `import.meta.env.BASE_URL`. One inconsistent line is a
 * mistake; a rule is what stops the next one.
 *
 * Scope: client-side URLs in `apps/web/src`. Server-side code, imports
 * and the `#ALIAS/...` import specifiers Astro resolves at build time
 * are not affected and are not scanned.
 *
 * Usage:
 *   bun tools/scripts/lint/web-absolute-api-urls.script.ts
 *   bun tools/scripts/lint/web-absolute-api-urls.script.ts --root <dir>
 */
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const SCAN_ROOT = join('apps', 'web', 'src');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.cache', '.git']);
const SCAN_EXTENSIONS = new Set(['.astro', '.ts', '.tsx', '.js']);

/**
 * A root-absolute URL handed to something that fetches it at runtime.
 *
 * Anchored on the CALL rather than on the string, because `/api/...` is
 * ordinary data elsewhere — a documented route, an example in prose —
 * and a gate that flagged those would be noise nobody reads.
 */
const ABSOLUTE_RUNTIME_URL =
	/\b(EventSource|WebSocket|fetch|open)\s*\(\s*(['"`])\/(?!\/)/gu;

export interface IAbsoluteUrlViolation {
	readonly relPath: string;
	readonly line: number;
	readonly snippet: string;
}

const walk = async (dir: string, out: string[]): Promise<void> => {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			await walk(abs, out);
			continue;
		}
		const dot = entry.name.lastIndexOf('.');
		if (dot === -1) continue;
		if (SCAN_EXTENSIONS.has(entry.name.slice(dot))) out.push(abs);
	}
};

/** Pure: given file contents, the offending lines. */
export const findAbsoluteApiUrls = (
	relPath: string,
	contents: string,
): readonly IAbsoluteUrlViolation[] => {
	const violations: IAbsoluteUrlViolation[] = [];
	for (const [index, line] of contents.split('\n').entries()) {
		const trimmed = line.trim();
		// A line describing the rule is documentation, not a call.
		if (
			trimmed.startsWith('*') ||
			trimmed.startsWith('//') ||
			trimmed.startsWith('<!--')
		) {
			continue;
		}
		ABSOLUTE_RUNTIME_URL.lastIndex = 0;
		if (ABSOLUTE_RUNTIME_URL.test(line)) {
			violations.push({ relPath, line: index + 1, snippet: trimmed });
		}
	}
	return violations;
};

export const scanForAbsoluteApiUrls = async (
	root: string,
): Promise<readonly IAbsoluteUrlViolation[]> => {
	const files: string[] = [];
	await walk(join(root, SCAN_ROOT), files);
	const found: IAbsoluteUrlViolation[] = [];
	for (const abs of files) {
		const rel = relative(root, abs).split('\\').join('/');
		found.push(...findAbsoluteApiUrls(rel, await readFile(abs, 'utf8')));
	}
	return found.sort((left, right) =>
		left.relPath === right.relPath
			? left.line - right.line
			: left.relPath.localeCompare(right.relPath),
	);
};

const main = async (argv: readonly string[]): Promise<number> => {
	const rootFlag = argv.indexOf('--root');
	const root =
		rootFlag === -1 ? process.cwd() : (argv[rootFlag + 1] ?? process.cwd());
	const violations = await scanForAbsoluteApiUrls(root);
	if (violations.length === 0) {
		process.stdout.write(
			'✓ web-absolute-api-urls: every runtime URL respects the base path.\n',
		);
		return 0;
	}
	process.stderr.write(
		`✖ web-absolute-api-urls: ${violations.length.toString()} runtime URL(s) ignore the site base path:\n`,
	);
	for (const violation of violations) {
		process.stderr.write(
			`  ${violation.relPath}:${violation.line.toString()}  ${violation.snippet}\n`,
		);
	}
	process.stderr.write(
		'\n  The site deploys under a base path (`/delendai`), so a leading `/`\n' +
			'  resolves against the domain root and 404s in production while working\n' +
			'  in local dev, where the base is empty. Build the URL from the base:\n' +
			"    const base = import.meta.env.BASE_URL.replace(/\\/$/, '');\n" +
			'    new EventSource(`${base}/api/events/logs`);\n',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
