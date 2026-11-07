import { describe, expect, it } from 'vitest';

import { testScopeOf, touchedSpecs } from './test-scope';

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
	it('runs the spec that mirrors a changed source, in its own workspace', () => {
		expect(touched(['pkg/src/lib/leaf.ts'])).toEqual([
			'pkg/tests/src/lib/direct.spec.ts',
			'pkg/tests/src/lib/leaf.spec.ts',
		]);
	});

	it('runs a changed spec, and a spec next to its source', () => {
		expect(touched(['pkg/tests/src/lib/user.spec.ts'])).toEqual([
			'pkg/tests/src/lib/user.spec.ts',
		]);
		expect(touched(['pkg/src/lib/own.ts'])).toEqual([
			'pkg/src/lib/own.spec.ts',
		]);
	});

	it('runs a spec that imports the changed file directly', () => {
		expect(touched(['pkg/src/lib/user.ts'])).toEqual([
			'pkg/tests/src/lib/user.spec.ts',
		]);
	});

	it('does not run a spec that only reaches the change through another module', () => {
		// user.ts imports leaf.ts and the barrel exports both: neither spec runs
		// for a change to leaf.ts beyond its mirror and its direct importer.
		const run = touched(['pkg/src/lib/leaf.ts']);
		expect(run).not.toContain('pkg/tests/src/lib/user.spec.ts');
		expect(run).not.toContain('pkg/tests/src/lib/barrel.spec.ts');
		expect(run).not.toContain('other/tests/src/lib/leaf.spec.ts');
	});

	it('runs nothing for a file no spec mirrors or imports', () => {
		expect(touched(['pkg/src/lib/lonely.ts', 'README.md'])).toEqual([]);
	});
});

describe('testScopeOf', () => {
	it('is touched unless the config names another scope', () => {
		expect(testScopeOf({})).toBe('touched');
		expect(testScopeOf(null)).toBe('touched');
		expect(testScopeOf({ testing: { scope: 'bogus' } })).toBe('touched');
		expect(testScopeOf({ testing: { scope: 'reach' } })).toBe('reach');
		expect(testScopeOf({ testing: { scope: 'all' } })).toBe('all');
	});
});
