import { describe, expect, it } from 'vitest';

import {
	bunRunnerChanged,
	bunSuiteCommand,
	isBunOwned,
	splitByRunner,
} from './bun-near-specs';

const OWNED = ['packages/sqlite/', 'plugins/p/tests/a.spec.ts'];

describe('isBunOwned', () => {
	it('[<7ms] owns a listed spec and everything under a listed directory', () => {
		expect(isBunOwned('plugins/p/tests/a.spec.ts', OWNED)).toBe(true);
		expect(isBunOwned('packages/sqlite/src/x.spec.ts', OWNED)).toBe(true);
		expect(isBunOwned('plugins/p/tests/b.spec.ts', OWNED)).toBe(false);
		expect(isBunOwned('packages/sqlite-other/x.spec.ts', OWNED)).toBe(
			false,
		);
	});

	it('[<7ms] reads the repository list by default', () => {
		expect(isBunOwned('packages/state-sqlite/anything.spec.ts')).toBe(true);
		expect(isBunOwned('packages/core/src/a.spec.ts')).toBe(false);
	});
});

describe('splitByRunner', () => {
	it('[<7ms] leaves the bun-owned specs out of the vitest list', () => {
		expect(
			splitByRunner(
				['packages/sqlite/a.spec.ts', 'packages/x/b.spec.ts'],
				OWNED,
			),
		).toEqual({
			vitest: ['packages/x/b.spec.ts'],
			bun: ['packages/sqlite/a.spec.ts'],
		});
	});
});

describe('bunSuiteCommand', () => {
	it('[<7ms] runs only the near bun specs', () => {
		expect(
			bunSuiteCommand(['packages/sqlite/src/a.ts'], ['s.spec.ts']),
		).toEqual(['bun', 'test', '--timeout', '30000', 's.spec.ts']);
	});

	it('[<7ms] runs nothing when no bun-owned spec is near', () => {
		expect(
			bunSuiteCommand(['packages/state-sqlite/src/a.ts'], []),
		).toBeUndefined();
	});

	it('[<7ms] runs the whole suite when the bun runner changed', () => {
		for (const path of [
			'bunfig.toml',
			'vitest.shared.ts',
			'tools/scripts/test/bun-owned-preload.ts',
		]) {
			expect(bunRunnerChanged([path])).toBe(true);
			expect(bunSuiteCommand([path], [])).toEqual([
				'bun',
				'run',
				'test:sqlite',
			]);
		}
		expect(bunRunnerChanged(['tools/scripts/test/other.ts'])).toBe(false);
	});
});
