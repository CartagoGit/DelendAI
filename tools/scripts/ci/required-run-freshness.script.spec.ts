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
			notApplicable: [],
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

	it.each(['skipped', 'cancelled'])(
		'rejects %s as not successful',
		(result) => {
			const report = evaluateRequiredRuns({ tests: { result } });

			expect(report.ok).toBe(false);
			expect(report.missing).toEqual([]);
			expect(report.notSuccessful).toEqual([`tests=${result}`]);
		},
	);

	it('rejects an empty dependency set', () => {
		expect(evaluateRequiredRuns({}).ok).toBe(false);
	});
});

/**
 * The one thing that may excuse an absent job, and everything that may
 * not.
 *
 * A skipped job is indistinguishable, from inside the aggregate, from a
 * job that was deliberately not run because the change could not affect
 * it. The difference lives entirely in whether the run PUBLISHED that
 * decision beforehand — so these cases pin that the excuse has to be
 * declared, cannot be inferred, and never stretches to a job that is
 * missing outright or failing.
 */
describe('evaluateRequiredRuns — deliberate non-application', () => {
	it('accepts a skipped job the run declared not applicable', () => {
		const report = evaluateRequiredRuns(
			{ typecheck: { result: 'success' }, site: { result: 'skipped' } },
			['site'],
		);
		expect(report.ok).toBe(true);
		expect(report.notApplicable).toEqual(['site']);
		// Counted apart from the jobs that actually ran: the aggregate
		// must be able to say "not checked, and here is why" rather than
		// "passed".
		expect(report.executed).toBe(1);
	});

	it('refuses a skipped job nobody declared', () => {
		const report = evaluateRequiredRuns(
			{ typecheck: { result: 'success' }, site: { result: 'skipped' } },
			[],
		);
		expect(report.ok).toBe(false);
		expect(report.notSuccessful).toEqual(['site=skipped']);
	});

	it('does not let a declaration excuse a FAILING job', () => {
		const report = evaluateRequiredRuns({ site: { result: 'failure' } }, [
			'site',
		]);
		expect(report.ok).toBe(false);
		expect(report.notSuccessful).toEqual(['site=failure']);
	});

	it('does not let a declaration excuse a job that never reported', () => {
		const report = evaluateRequiredRuns({ site: {} }, ['site']);
		expect(report.ok).toBe(false);
		expect(report.missing).toEqual(['site']);
	});

	it('does not let a declaration excuse a cancelled job', () => {
		const report = evaluateRequiredRuns({ site: { result: 'cancelled' } }, [
			'site',
		]);
		expect(report.ok).toBe(false);
	});
});
