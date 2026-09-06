#!/usr/bin/env bun
/**
 * capture-gate-file-sets.script.ts — r00046 S2 helper.
 *
 * Captures the exact set of files each of the four migrated gates
 * (type-naming, types-in-contracts, effect-boundaries,
 * core-proposals-boundary) currently walks, with their current
 * exclusion rules baked in. The capture is written to
 * `.cache/delendai/r00046-gate-filesets.json` so the migration can
 * prove (by element-wise comparison) that the post-migration walker
 * returns the same set.
 *
 * The script is hermetic: it does not invoke the gates; it re-implements
 * each gate's walker locally so the capture is independent of the
 * gate's own I/O. (Re-using the gate's exported `scanViolations`
 * would couple the baseline to the very code we are about to refactor.)
 */
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from './monorepo-paths';

type RelSet = Record<string, readonly string[]>;

const EXCLUDE_GENERATED = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
	'generated',
]);
const EXCLUDE_GEN_TESTS = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
	'generated',
	'tests',
	'__tests__',
]);
const TS_ONLY = /\.tsx?$/;
const NOT_DTS = (n: string): boolean => !n.endsWith('.d.ts');
const NOT_GENERATED = (n: string): boolean => !n.endsWith('.generated.ts');

const walk = (
	root: string,
	absDir: string,
	exclude: ReadonlySet<string>,
	out: string[],
): void => {
	for (const entry of readdirSync(absDir, { withFileTypes: true })) {
		if (entry.name.startsWith('.') && entry.name !== '.') continue;
		const abs = join(absDir, entry.name);
		if (entry.isDirectory()) {
			if (exclude.has(entry.name)) continue;
			walk(root, abs, exclude, out);
		} else if (TS_ONLY.test(entry.name)) {
			const rel = relative(root, abs).split('\\').join('/');
			out.push(rel);
		}
	}
};

const captureGate = (
	root: string,
	globs: readonly string[],
	exclude: ReadonlySet<string>,
	exemptFile?: (rel: string) => boolean,
): readonly string[] => {
	const files: string[] = [];
	for (const glob of globs) {
		const abs = join(root, glob);
		if (!existsSync(abs)) continue;
		walk(root, abs, exclude, files);
	}
	const filtered = exemptFile ? files.filter((r) => !exemptFile(r)) : files;
	return [...new Set(filtered)].sort();
};

const typeNamingExempt = (rel: string): boolean =>
	rel.endsWith('.spec.ts') ||
	rel.endsWith('.test.ts') ||
	rel.endsWith('.d.ts') ||
	rel.endsWith('.generated.ts') ||
	rel.includes('/generated/');

const typesInContractsExempt = (rel: string): boolean =>
	rel.includes('/contracts/interfaces/') ||
	rel.includes('/contracts/constants/') ||
	rel.endsWith('.interface.ts') ||
	rel.endsWith('.constant.ts') ||
	rel.endsWith('.spec.ts') ||
	rel.endsWith('.test.ts') ||
	rel.endsWith('.d.ts') ||
	rel.endsWith('.generated.ts');

const effectBoundariesExempt = (rel: string): boolean =>
	!rel.includes('/src/') ||
	rel.endsWith('.spec.ts') ||
	rel.endsWith('.test.ts') ||
	rel.endsWith('.d.ts') ||
	rel.endsWith('.generated.ts');

const main = (): number => {
	const root = repoRoot();

	const typeNaming = captureGate(
		root,
		['packages', 'plugins', 'apps', 'extensions', 'tools'],
		EXCLUDE_GENERATED,
		typeNamingExempt,
	);
	const typesInContracts = captureGate(
		root,
		['packages', 'plugins', 'apps', 'extensions'],
		EXCLUDE_GEN_TESTS,
		typesInContractsExempt,
	);
	const effectBoundaries = captureGate(
		root,
		['plugins'],
		EXCLUDE_GEN_TESTS,
		effectBoundariesExempt,
	);
	// core-proposals-boundary has its own walker already, but the
	// structure is simpler: async readdir over `packages/core/src`,
	// SKIP_SEGMENTS=['/generated/'], SKIP_SUFFIXES=['.generated.ts','.d.ts'].
	// Re-use the same primitive.
	const coreProposalsBoundary = captureGate(
		root,
		['packages/core/src'],
		EXCLUDE_GEN_TESTS,
		(rel) =>
			rel.includes('/generated/') ||
			rel.endsWith('.generated.ts') ||
			rel.endsWith('.d.ts'),
	);

	const result: RelSet = {
		'type-naming': typeNaming,
		'types-in-contracts': typesInContracts,
		'effect-boundaries': effectBoundaries,
		'core-proposals-boundary': coreProposalsBoundary,
	};

	const cacheDir = join(root, '.cache', 'delendai');
	mkdirSync(cacheDir, { recursive: true });
	const outPath = join(cacheDir, 'r00046-gate-filesets.json');
	writeFileSync(outPath, `${JSON.stringify(result, null, '\t')}\n`, 'utf8');

	process.stdout.write(
		`captured: type-naming=${typeNaming.length}, ` +
			`types-in-contracts=${typesInContracts.length}, ` +
			`effect-boundaries=${effectBoundaries.length}, ` +
			`core-proposals-boundary=${coreProposalsBoundary.length} → ${outPath}\n`,
	);
	return 0;
};

main();
