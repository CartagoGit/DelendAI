#!/usr/bin/env bun
/**
 * no-core-public-types-in-client.script.ts — r00030 lint, x00545 fix.
 *
 * Enforces that `packages/client/src/**` does NOT import TYPES from
 * `@delendai/core/public` (or bare `@delendai/core`). Type-only
 * imports of `@delendai/core/contracts` are the canonical alternative
 * for client code; runtime values must still come from
 * `@delendai/core/public`.
 *
 * Flags:
 *   - `import type { X } from '@delendai/core'`        (bare default)
 *   - `import type { X } from '@delendai/core/public'` (the runtime barrel)
 *   - `import { type X } from '@delendai/core/public'`  (mixed imports)
 *
 * ## Why this scans the whole file (x00545)
 *
 * This lint used to split each file into lines and run its regex once
 * per line. That regex needs the whole import — `import type {`, the
 * specifiers, and the `from '...'` — to sit on ONE line. This repo's
 * house style wraps import specifiers across lines, so the rule was
 * structurally unable to see its own subject: it reported
 * `0 violations across 53 file(s)` while four files in the scanned set
 * held exactly the import it forbids. A gate that cannot fail is worse
 * than no gate, because it is cited as evidence.
 *
 * The scan is therefore over the whole file text, with comments blanked
 * first (newlines preserved, so reported line numbers stay true) and
 * each finding attributed to the line its `import` keyword starts on.
 *
 * Skips:
 *   - Anything in `node_modules`, `dist`, or `.cache`.
 *   - Line and block comments.
 *   - Spec files.
 */

import { readdir, readFile, stat as fsStat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = `${import.meta.dirname ?? import.meta.dir}/../../../packages/client/src`;

/**
 * `import type { … } from '<core>'` or a mixed import carrying an
 * inline `type` modifier. `[^}]*` spans newlines, so a wrapped import
 * matches as one unit. The specifier alternation ends at the closing
 * quote, so `@delendai/core-extras` cannot match `@delendai/core`.
 */
const TYPE_IMPORT =
	/import\s+type\s*\{[^}]*\}\s*from\s*['"](@delendai\/core(?:\/public)?)['"]|import\s*\{[^}]*\btype\b[^}]*\}\s*from\s*['"](@delendai\/core(?:\/public)?)['"]/g;

export interface IViolation {
	readonly line: number;
	readonly reason: string;
}

/**
 * Blank out comments while preserving every newline, so offsets later
 * in the file still map to their real line numbers.
 */
const blankComments = (text: string): string => {
	const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (match) =>
		match.replace(/[^\n]/g, ' '),
	);
	return withoutBlocks
		.split('\n')
		.map((line) => (line.trim().startsWith('//') ? '' : line))
		.join('\n');
};

/** 1-based line number of `index` within `text`. */
const lineAt = (text: string, index: number): number =>
	text.slice(0, index).split('\n').length;

/**
 * The pure half: find every forbidden type import in one file's source.
 * Exported so the spec exercises source text directly rather than
 * whatever happens to sit in `packages/client` today.
 */
export const findViolations = (source: string): readonly IViolation[] => {
	const text = blankComments(source);
	const findings: IViolation[] = [];
	TYPE_IMPORT.lastIndex = 0;
	let match = TYPE_IMPORT.exec(text);
	while (match !== null) {
		const specifier = match[1] ?? match[2] ?? '@delendai/core';
		findings.push({
			line: lineAt(text, match.index),
			reason: `type-only import from '${specifier}' — migrate to '@delendai/core/contracts'`,
		});
		match = TYPE_IMPORT.exec(text);
	}
	return findings;
};

const walk = async (dir: string): Promise<readonly string[]> => {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		const s = await fsStat(full).catch(() => null);
		if (s === null) continue;
		if (s.isDirectory()) {
			out.push(...(await walk(full)));
		} else if (
			entry.endsWith('.ts') &&
			!entry.endsWith('.spec.ts') &&
			!entry.endsWith('.test.ts')
		) {
			out.push(full);
		}
	}
	return out;
};

export const main = async (): Promise<number> => {
	const files = await walk(ROOT);
	const allFindings: {
		file: string;
		findings: readonly IViolation[];
	}[] = [];
	for (const file of files) {
		const findings = findViolations(await readFile(file, 'utf8'));
		if (findings.length > 0) {
			allFindings.push({ file: relative(process.cwd(), file), findings });
		}
	}
	if (allFindings.length === 0) {
		process.stdout.write(
			`no-core-public-types-in-client: 0 violations across ${files.length} file(s).\n`,
		);
		return 0;
	}
	for (const { file, findings } of allFindings) {
		process.stdout.write(`\n${file}\n`);
		for (const f of findings) {
			process.stdout.write(`  line ${f.line}: ${f.reason}\n`);
		}
	}
	process.stdout.write(
		`\nno-core-public-types-in-client: ${allFindings.length} file(s) violated the contract.\n`,
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
