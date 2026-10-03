import { describe, expect, it } from 'vitest';

import {
	POLICY_GUIDANCE,
	resolveTestPolicy,
	TEST_POLICY_MODES,
	type ITestPolicyMode,
} from '../../../src/lib/policy';

describe('TEST_POLICY_MODES', () => {
	it('declares exactly the four agreed modes with tdd first', () => {
		expect(TEST_POLICY_MODES).toEqual([
			'tdd',
			'tests-after',
			'free',
			'none',
		]);
	});

	it('ships imperative guidance for every mode', () => {
		for (const mode of TEST_POLICY_MODES) {
			const guidance = POLICY_GUIDANCE[mode];
			expect(guidance.length).toBeGreaterThanOrEqual(2);
			for (const line of guidance) expect(line.trim()).not.toBe('');
		}
	});

	it('tdd guidance demands red-before-green', () => {
		const joined = POLICY_GUIDANCE.tdd.join(' ').toLowerCase();
		expect(joined).toContain('failing');
		expect(joined).toContain('before');
	});
});

describe('resolveTestPolicy', () => {
	it('defaults to tdd when nothing is configured', () => {
		expect(resolveTestPolicy({})).toEqual({
			mode: 'tdd',
			source: 'default',
		});
	});

	it('config mode wins over the default', () => {
		expect(resolveTestPolicy({ configMode: 'tests-after' })).toEqual({
			mode: 'tests-after',
			source: 'config',
		});
	});

	it('a runtime override wins over config', () => {
		expect(
			resolveTestPolicy({ configMode: 'none', override: 'free' }),
		).toEqual({ mode: 'free', source: 'override' });
	});

	it('an override equal to the config still reports source override', () => {
		expect(
			resolveTestPolicy({ configMode: 'tdd', override: 'tdd' }),
		).toEqual({ mode: 'tdd', source: 'override' });
	});

	it('every mode round-trips through the resolver', () => {
		for (const mode of TEST_POLICY_MODES) {
			expect(resolveTestPolicy({ override: mode }).mode).toBe(
				mode satisfies ITestPolicyMode,
			);
		}
	});
});
