#!/usr/bin/env bun
/**
 * verify-r00046-file-sets.script.ts — r00046 S2 verifier.
 *
 * Compares the file set each of the four migrated gates walks BEFORE
 * (`.cache/delendai/r00046-gate-filesets.json`) and AFTER the migration.
 * The "after" set is re-derived here from `walkTsFiles` with the
 * `authoredOnly: true` option + the gate's specific post-filter, so
 * the verifier is independent of the gate's own walker code (it
 * verifies the SHARED WALKER produces the right set, not the gate's
 * consumer).
 *
 * Exits 0 iff every gate's set matches element-wise. Exits 1 with a
 * precise diff otherwise.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { walkTsFiles } from '@delendai/core/public';

import { repoRoot } from './monorepo-paths';

interface IBaseline {
	readonly [gate: string]: readonly string[];
}

const GATES: readonly string[] = [
	'type-naming',
	'types-in-contracts',
	'effect-boundaries',
	'core-proposals-boundary',
];

const SCAN_GLOBS: Readonly<Record<string, readonly string[]>> = {
	'type-naming': ['packages', 'plugins', 'apps', 'extensions', 'tools'],
	'types-in-contracts': ['packages', 'plugins', 'apps', 'extensions'],
	'effect-boundaries': ['plugins'],
	'core-proposals-boundary': ['packages/core/src'],
};

const isExemptFile = (gate: string, rel: string): boolean => {
	// The verifier itself is brand new (this PR) so it doesn't appear
	// in the captured baseline; exclude it explicitly so the diff is
	// meaningful for the gates' actual scanned set.
	if (rel === 'tools/scripts/lib/verify-r00046-file-sets.script.ts')
		return true;
	switch (gate) {
		case 'type-naming':
			return (
				rel.endsWith('.spec.ts') ||
				rel.endsWith('.test.ts') ||
				rel.endsWith('.d.ts') ||
				rel.endsWith('.generated.ts') ||
				rel.includes('/generated/')
			);
		case 'types-in-contracts':
			return (
				rel.includes('/contracts/interfaces/') ||
				rel.includes('/contracts/constants/') ||
				rel.endsWith('.interface.ts') ||
				rel.endsWith('.constant.ts') ||
				rel.endsWith('.spec.ts') ||
				rel.endsWith('.test.ts') ||
				rel.endsWith('.d.ts') ||
				rel.endsWith('.generated.ts') ||
				rel.includes('/tests/') ||
				rel.includes('/__tests__/') ||
				rel.startsWith('tests/') ||
				rel.startsWith('__tests__/')
			);
		case 'effect-boundaries':
			return (
				!rel.includes('/src/') ||
				rel.endsWith('.spec.ts') ||
				rel.endsWith('.test.ts') ||
				rel.endsWith('.d.ts') ||
				rel.endsWith('.generated.ts') ||
				rel.includes('/tests/') ||
				rel.includes('/__tests__/') ||
				rel.startsWith('tests/') ||
				rel.startsWith('__tests__/')
			);
		case 'core-proposals-boundary':
			return rel.includes('/coverage/');
		default:
			return false;
	}
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	const baselinePath = join(
		root,
		'.cache',
		'delendai',
		'r00046-gate-filesets.json',
	);
	const baseline = JSON.parse(
		readFileSync(baselinePath, 'utf8'),
	) as IBaseline;

	let failures = 0;
	for (const gate of GATES) {
		const before = new Set(baseline[gate] ?? []);
		const globs = SCAN_GLOBS[gate] ?? [];
		const all = await walkTsFiles(root, globs, { authoredOnly: true });
		const after = new Set(all.filter((rel) => !isExemptFile(gate, rel)));

		const onlyBefore = [...before].filter((r) => !after.has(r));
		const onlyAfter = [...after].filter((r) => !before.has(r));

		if (onlyBefore.length === 0 && onlyAfter.length === 0) {
			process.stdout.write(
				`✓ ${gate}: ${before.size} files (before) === ${after.size} (after)\n`,
			);
		} else {
			failures += 1;
			process.stdout.write(
				`✖ ${gate}: ${before.size} (before) vs ${after.size} (after) — diff:\n` +
					`    only-before: ${onlyBefore.length}\n` +
					`    only-after:  ${onlyAfter.length}\n`,
			);
			for (const r of onlyBefore.slice(0, 5))
				process.stdout.write(`      - ${r}\n`);
			for (const r of onlyAfter.slice(0, 5))
				process.stdout.write(`      + ${r}\n`);
		}
	}

	if (failures > 0) {
		process.stdout.write(
			`\n✖ ${failures} gate(s) changed their file set — this is exactly the failure r00046 set out to prevent.\n`,
		);
		return 1;
	}
	process.stdout.write(
		'\n✓ all 4 gates walk identical file sets before and after the migration.\n',
	);
	return 0;
};

process.exit(await main());
