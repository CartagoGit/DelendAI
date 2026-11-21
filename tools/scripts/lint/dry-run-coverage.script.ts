#!/usr/bin/env bun
/**
 * dry-run-coverage.script.ts — counts the tool registrations that declare
 * effects without `dryRunSupported: true`. The runtime stops a dryRun call
 * to a tool whose schema does not accept the flag, so such a tool is safe
 * but cannot be previewed; this ratchet keeps that number from growing.
 * Same shape as `effect-boundaries.script.ts`: a `{ relPath: count }`
 * baseline, `--update` rewrites it, only a new or larger count fails.
 *
 * Usage:
 *   bun tools/scripts/lint/dry-run-coverage.script.ts            # check
 *   bun tools/scripts/lint/dry-run-coverage.script.ts --update   # rewrite baseline
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkTsFiles } from '@delendai/core/cli';

import { repoRoot } from '../lib/monorepo-paths';
import { lintRepoRoot, refuseMissingScanRoots } from './lib/scan-roots.lib';

const SCAN_ROOTS: readonly string[] = ['plugins', 'packages/core/src'];
const BASELINE_REL = 'tools/scripts/lint/dry-run-coverage.baseline.json';

const isScanned = (rel: string): boolean =>
	rel.includes('/src/') &&
	!rel.includes('/tests/') &&
	!rel.includes('/dry-run/') &&
	!rel.includes('/contracts/') &&
	!rel.endsWith('.spec.ts') &&
	!rel.endsWith('.d.ts');

/** Registrations with effects that do not declare preview support. Pure. */
export const countUnpreviewable = (body: string): number => {
	const effectful = body.match(/\beffects:\s*\[\s*['"]/g)?.length ?? 0;
	const supported = body.match(/\bdryRunSupported:\s*true/g)?.length ?? 0;
	return Math.max(0, effectful - supported);
};

export const scanUnpreviewable = async (
	root: string,
): Promise<Record<string, number>> => {
	const files = await walkTsFiles(root, SCAN_ROOTS, { authoredOnly: true });
	const result: Record<string, number> = {};
	for (const rel of files.filter(isScanned).sort()) {
		const count = countUnpreviewable(readFileSync(join(root, rel), 'utf8'));
		if (count > 0) result[rel] = count;
	}
	return result;
};

/** The lines a growth prints; empty when nothing grew. Pure. */
export const growthOf = (
	current: Readonly<Record<string, number>>,
	baseline: Readonly<Record<string, number>>,
): readonly string[] =>
	Object.entries(current)
		.filter(([rel, count]) => count > (baseline[rel] ?? 0))
		.map(
			([rel, count]) =>
				`  ${rel}: ${count} (baseline ${baseline[rel] ?? 0}) — accept dryRun, return planDryRun and set dryRunSupported: true`,
		);

const total = (counts: Readonly<Record<string, number>>): number =>
	Object.values(counts).reduce((sum, count) => sum + count, 0);

const renderBaseline = (counts: Readonly<Record<string, number>>): string => {
	const rows = Object.entries(counts).map(
		([rel, count]) => `\t${JSON.stringify(rel)}: ${count}`,
	);
	return `{\n${rows.join(',\n')}\n}\n`;
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	const current = await scanUnpreviewable(root);
	const path = join(root, BASELINE_REL);
	if (process.argv.includes('--update')) {
		writeFileSync(path, renderBaseline(current));
		process.stderr.write(
			`dry-run-coverage: baselined ${total(current)}.\n`,
		);
		return 0;
	}
	const baseline = existsSync(path)
		? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>)
		: {};
	const growth = growthOf(current, baseline);
	if (growth.length > 0) {
		process.stderr.write(
			`✖ dry-run-coverage: effectful registrations without dryRun support grew:\n${growth.join('\n')}\n`,
		);
		return 1;
	}
	process.stderr.write(
		`✓ dry-run-coverage: ${total(current)} effectful registration(s) without dryRun support (baseline ${total(baseline)}).\n`,
	);
	return 0;
};

if (import.meta.main) {
	if (
		refuseMissingScanRoots(
			'dry-run-coverage',
			lintRepoRoot(import.meta.url),
			SCAN_ROOTS,
		)
	)
		process.exit(1);
	process.exit(await main());
}
