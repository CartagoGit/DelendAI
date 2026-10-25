/**
 * state-engine-coverage.script.spec.ts — the methods checked are the ones
 * IStateRegistry declares, and one with no test is a gap.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	registryMethods,
	scanStateSqliteMethodCoverage,
} from './state-engine-coverage.script';

const fakeRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'state-coverage-'));
	mkdirSync(join(root, 'packages', 'contracts', 'src'), { recursive: true });
	writeFileSync(
		join(root, 'packages', 'contracts', 'src', 'state.ts'),
		[
			'export interface IStateRegistry {',
			'\thydrate(input: IHydrateInput): IHydrateResult;',
			'\tgc(scope?: StateScope): number;',
			'}',
		].join('\n'),
	);
	mkdirSync(join(root, 'packages', 'state-sqlite', 'src'), {
		recursive: true,
	});
	writeFileSync(
		join(root, 'packages', 'state-sqlite', 'src', 'a.spec.ts'),
		'registry.hydrate(input);\n',
	);
	return root;
};

describe('state-engine-coverage', () => {
	it('reads the methods from the contract', () => {
		expect(registryMethods(fakeRoot())).toEqual(['gc', 'hydrate']);
		expect(registryMethods()).toContain('releaseProjectLease');
	});

	it('finds a method no spec calls', () => {
		const coverage = scanStateSqliteMethodCoverage(fakeRoot());
		expect(coverage.find((each) => each.method === 'gc')?.tests).toEqual(
			[],
		);
		expect(
			coverage.find((each) => each.method === 'hydrate')?.tests,
		).toHaveLength(1);
	});
});
