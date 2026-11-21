import { describe, expect, it } from 'vitest';

import { fileURLToPath } from 'node:url';

import { testScopeOf, touchedSpecs, touchedSpecsOf } from './test-scope';

/** A fixture repository: each spec and the files it imports. */
const IMPORTS: Readonly<Record<string, readonly string[]>> = {
	'pkg/tests/src/lib/leaf.spec.ts': ['pkg/src/lib/leaf.ts'],
	'pkg/tests/src/lib/direct.spec.ts': ['pkg/src/lib/leaf.ts'],
	'pkg/tests/src/lib/user.spec.ts': ['pkg/src/lib/user.ts'],
	'pkg/tests/src/lib/barrel.spec.ts': ['pkg/src/index.ts'],
	'other/tests/src/lib/leaf.spec.ts': ['other/src/lib/leaf.ts'],
	'pkg/src/lib/own.spec.ts': [],
};
const SPECS = Object.keys(IMPORTS);

const touched = (changed: readonly string[]): readonly string[] =>
	touchedSpecs(changed, SPECS, (spec) => IMPORTS[spec] ?? []);

describe('touchedSpecs', () => {
	it('[<50ms] runs the spec that mirrors a changed source, in its own workspace', () => {
		expect(touched(['pkg/src/lib/leaf.ts'])).toEqual([
			'pkg/tests/src/lib/direct.spec.ts',
			'pkg/tests/src/lib/leaf.spec.ts',
		]);
	});

	it('[<50ms] runs a changed spec, and a spec next to its source', () => {
		expect(touched(['pkg/tests/src/lib/user.spec.ts'])).toEqual([
			'pkg/tests/src/lib/user.spec.ts',
		]);
		expect(touched(['pkg/src/lib/own.ts'])).toEqual([
			'pkg/src/lib/own.spec.ts',
		]);
	});

	it('[<50ms] runs a spec that imports the changed file directly', () => {
		expect(touched(['pkg/src/lib/user.ts'])).toEqual([
			'pkg/tests/src/lib/user.spec.ts',
		]);
	});

	it('[<50ms] does not run a spec that only reaches the change through another module', () => {
		// user.ts imports leaf.ts and the barrel exports both: neither spec runs
		// for a change to leaf.ts beyond its mirror and its direct importer.
		const run = touched(['pkg/src/lib/leaf.ts']);
		expect(run).not.toContain('pkg/tests/src/lib/user.spec.ts');
		expect(run).not.toContain('pkg/tests/src/lib/barrel.spec.ts');
		expect(run).not.toContain('other/tests/src/lib/leaf.spec.ts');
	});

	it('[<50ms] runs nothing for a file no spec mirrors or imports', () => {
		expect(touched(['pkg/src/lib/lonely.ts', 'README.md'])).toEqual([]);
	});
});

describe('touchedSpecs of a changed barrel', () => {
	// #1838: one export added to a barrel selected the specs behind all of it.
	const BARREL = 'pkg/src/cli.ts';
	const IMPORTED: Readonly<Record<string, readonly string[] | '*'>> = {
		'pkg/tests/a.spec.ts': ['assembleCliConfig'],
		'pkg/tests/fresh.spec.ts': ['assembleCliConfig', 'fresh'],
		'pkg/tests/all.spec.ts': '*',
	};
	const specs = Object.keys(IMPORTED);
	const run = (delta: ReadonlySet<string> | '*' | undefined) =>
		touchedSpecs([BARREL], specs, () => [BARREL], {
			deltaOf: () => delta,
			namesOf: (spec) => IMPORTED[spec] ?? [],
		});

	it('[<50ms] selects only the importers of the export that was added', () => {
		expect(run(new Set(['fresh']))).toEqual([
			'pkg/tests/all.spec.ts',
			'pkg/tests/fresh.spec.ts',
		]);
	});

	it('[<50ms] selects every direct importer when the file is no barrel or the delta is unbounded', () => {
		expect(run(undefined)).toEqual([...specs].sort());
		expect(run('*')).toEqual([...specs].sort());
	});

	it('[<50ms] selects no importer when no export moved', () => {
		expect(run(new Set())).toEqual(['pkg/tests/all.spec.ts']);
	});
});

describe('testScopeOf', () => {
	it('[<50ms] is touched unless the config names another scope', () => {
		expect(testScopeOf({})).toBe('touched');
		expect(testScopeOf(null)).toBe('touched');
		expect(testScopeOf({ testing: { scope: 'bogus' } })).toBe('touched');
		expect(testScopeOf({ testing: { scope: 'reach' } })).toBe('reach');
		expect(testScopeOf({ testing: { scope: 'all' } })).toBe('all');
	});
});

describe('touchedSpecs of the direct importers of a changed source', () => {
	const SPECS_OF = [
		'packages/p/tests/src/lib/user.spec.ts',
		'packages/p/tests/src/lib/barrel-user.spec.ts',
		'packages/p/tests/src/lib/far.spec.ts',
	];
	const SOURCES: Readonly<Record<string, readonly string[]>> = {
		'packages/p/src/lib/leaf.ts': [
			'packages/p/src/lib/user.ts',
			'packages/p/src/index.ts',
		],
		'packages/p/src/lib/user.ts': ['packages/p/src/lib/far.ts'],
	};
	const run = (changed: readonly string[]): readonly string[] =>
		touchedSpecs(
			changed,
			SPECS_OF,
			() => [],
			undefined,
			(source) => SOURCES[source] ?? [],
		);

	it('[<50ms] runs the mirror of a source that imports the changed one, one hop only', () => {
		expect(run(['packages/p/src/lib/leaf.ts'])).toEqual([
			'packages/p/tests/src/lib/user.spec.ts',
		]);
	});

	it('[<50ms] does not follow the barrel that re-exports the changed source', () => {
		expect(run(['packages/p/src/lib/leaf.ts'])).not.toContain(
			'packages/p/tests/src/lib/barrel-user.spec.ts',
		);
	});
});

describe('touchedSpecsOf the files of #2231', () => {
	it('[<50ms] selects work.command.spec.ts, whose source imports the changed deliver service', () => {
		const root = fileURLToPath(new URL('../../..', import.meta.url));
		const cli = 'packages/cli/src';
		const tracked = [
			`${cli}/lib/work-deliver.service.ts`,
			`${cli}/lib/work-deliver.service.spec.ts`,
			`${cli}/commands/work.command.ts`,
			`${cli}/commands/work.command.spec.ts`,
		];
		expect(
			touchedSpecsOf(
				root,
				[`${cli}/lib/work-deliver.service.ts`],
				tracked,
				{},
			),
		).toEqual([
			`${cli}/commands/work.command.spec.ts`,
			`${cli}/lib/work-deliver.service.spec.ts`,
		]);
	});
});
