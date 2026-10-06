#!/usr/bin/env bun
/**
 * state-telemetry-purity.script.ts — keeps the progress projector pure.
 *
 * Every non-spec `.ts` file under `packages/state-telemetry/src/lib/projector`:
 *   - must not import a persistent I/O API (`node:fs*`, `bun:sqlite`, ...);
 *   - must not contain `await` inside a `rebuild` or `reconcile` body,
 *     because the State Engine calls both synchronously.
 *
 * Usage: bun tools/scripts/lint/state-telemetry-purity.script.ts
 * Failure prints each finding as `file:line  reason` and exits 1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { walkTsFiles } from '@delendai/core/cli';

import { repoRoot } from '../lib/monorepo-paths';

const SCAN_ROOTS: readonly string[] = [
	'packages/state-telemetry/src/lib/projector',
];
const EXEMPT_SUFFIXES: readonly string[] = [
	'.spec.ts',
	'.test.ts',
	'.d.ts',
	'.helper.ts',
];
const BANNED_IMPORT_RE =
	/from\s+['"](?:node:)?(fs|fs\/promises|bun:sqlite|better-sqlite3|sqlite3|stream)['"]/;
const SYNC_ENTRY_RE = /\b(rebuild|reconcile)\b\s*(?::|\()[^\n]*?(?:=>|\{)/;
const AWAIT_RE = /\bawait\b/;

export interface IProjectorPurityFinding {
	readonly relPath: string;
	readonly line: number;
	readonly reason: string;
}

/** Lines of `body` that sit inside the braces opened by a rebuild/reconcile declaration. */
const syncBodyLines = (lines: readonly string[]): ReadonlySet<number> => {
	const inside = new Set<number>();
	for (let i = 0; i < lines.length; i++) {
		if (!SYNC_ENTRY_RE.test(lines[i] ?? '')) continue;
		let depth = 0;
		let opened = false;
		for (let j = i; j < lines.length; j++) {
			for (const ch of lines[j] ?? '') {
				if (ch === '{') {
					depth++;
					opened = true;
				} else if (ch === '}') depth--;
			}
			inside.add(j);
			if (opened && depth <= 0) break;
		}
	}
	return inside;
};

export const scanSource = (
	relPath: string,
	body: string,
): IProjectorPurityFinding[] => {
	const lines = body.split('\n');
	const syncLines = syncBodyLines(lines);
	const findings: IProjectorPurityFinding[] = [];
	for (const [i, line] of lines.entries()) {
		if (BANNED_IMPORT_RE.test(line))
			findings.push({
				relPath,
				line: i + 1,
				reason: 'persistent I/O import in the projector',
			});
		if (syncLines.has(i) && AWAIT_RE.test(line))
			findings.push({
				relPath,
				line: i + 1,
				reason: '`await` inside rebuild/reconcile',
			});
	}
	return findings;
};

export const scanProjectorPurity = async (
	root: string = repoRoot(),
): Promise<readonly IProjectorPurityFinding[]> => {
	const files = await walkTsFiles(root, SCAN_ROOTS);
	return files
		.filter(
			(rel) => !EXEMPT_SUFFIXES.some((suffix) => rel.endsWith(suffix)),
		)
		.flatMap((rel) =>
			scanSource(rel, readFileSync(join(root, rel), 'utf8')),
		);
};

const main = async (): Promise<number> => {
	const findings = await scanProjectorPurity();
	if (findings.length === 0) {
		process.stdout.write(
			'✓ state-telemetry-purity: the projector is pure.\n',
		);
		return 0;
	}
	process.stdout.write(
		`✖ state-telemetry-purity: ${findings.length} finding(s).\n`,
	);
	for (const f of findings)
		process.stdout.write(`  ${f.relPath}:${f.line}  ${f.reason}\n`);
	return 1;
};

if (import.meta.main) process.exit(await main());
