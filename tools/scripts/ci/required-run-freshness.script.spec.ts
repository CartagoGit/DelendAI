import { describe, expect, it } from 'vitest';

import { evaluateRequiredRuns } from './required-run-freshness.script.ts';

describe('evaluateRequiredRuns', () => {
	it('passes only when every required job executed successfully', () => {
		const report = evaluateRequiredRuns({
			lint: { result: 'success' },
			tests: { result: 'success' },
		});

		expect(report).toEqual({
			ok: true,
			total: 2,
			executed: 2,
			missing: [],
			notSuccessful: [],
		});
	});

	it('distinguishes a job that did not execute from a failed job', () => {
		const report = evaluateRequiredRuns({
			lint: {},
			tests: { result: 'failure' },
		});

		expect(report.ok).toBe(false);
		expect(report.executed).toBe(1);
		expect(report.missing).toEqual(['lint']);
		expect(report.notSuccessful).toEqual(['tests=failure']);
	});

	it.each(['skipped', 'cancelled'])('rejects %s as not successful', (result) => {
		const report = evaluateRequiredRuns({ tests: { result } });

		expect(report.ok).toBe(false);
		expect(report.missing).toEqual([]);
		expect(report.notSuccessful).toEqual([`tests=${result}`]);
	});

	it('rejects an empty dependency set', () => {
		expect(evaluateRequiredRuns({}).ok).toBe(false);
	});
});
