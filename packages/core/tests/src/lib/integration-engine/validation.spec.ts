/**
 * validation.spec.ts — the verdict function, which is where "fail
 * closed" either is or is not true.
 *
 * The dangerous case is not a red check; it is a required check the
 * forge never reported. Nothing distinguishes "has not started" from
 * "does not exist" at this layer, and treating either as a pass is how an
 * unvalidated candidate reaches the integration branch — so both must
 * come back `pending`, and that is asserted directly rather than through
 * a cycle where a merge might mask it.
 */

import { describe, expect, it } from 'vitest';

import { evaluateValidation } from '@delendai/core/lib/integration-engine/index';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

/**
 * A policy that DOES require a context. The profile itself ships an empty
 * `requiredChecks` on purpose (aabad2cd) — no profile can know what a
 * project's CI calls its checks — so the required-context cases have to
 * name one here, or they and `deferring()` below would be the same
 * fixture and every one of them would pass vacuously.
 */
const policy = () => {
	const base = expandProfile('shared-checkout-pr');
	return {
		...base,
		integration: { ...base.integration, requiredChecks: ['ci-complete'] },
	};
};

/** The same policy with no required contexts: the forge decides. */
const deferring = () => {
	const base = policy();
	return {
		...base,
		integration: { ...base.integration, requiredChecks: [] },
	};
};

describe('evaluateValidation', () => {
	it('is green only when every required context succeeded', () => {
		const report = evaluateValidation(policy(), {
			sha: 'abc',
			checks: [{ name: 'ci-complete', state: 'success' }],
		});
		expect(report.verdict).toBe('green');
		expect(report.outstanding).toEqual([]);
	});

	it('is pending — never green — when a required context is missing', () => {
		const report = evaluateValidation(policy(), {
			sha: 'abc',
			checks: [{ name: 'something-else', state: 'success' }],
		});
		expect(report.verdict).toBe('pending');
		expect(report.outstanding).toEqual(['ci-complete']);
	});

	it('is pending when no check has been reported at all', () => {
		const report = evaluateValidation(policy(), { sha: 'abc', checks: [] });
		expect(report.verdict).toBe('pending');
	});

	it('counts a cancelled or timed out required check as red', () => {
		for (const state of ['cancelled', 'timed_out', 'failure'] as const) {
			const report = evaluateValidation(policy(), {
				sha: 'abc',
				checks: [{ name: 'ci-complete', state }],
			});
			expect(report.verdict).toBe('red');
			expect(report.failed).toEqual(['ci-complete']);
		}
	});

	it('accepts a neutral required check, matching the forges', () => {
		const report = evaluateValidation(policy(), {
			sha: 'abc',
			checks: [{ name: 'ci-complete', state: 'neutral' }],
		});
		expect(report.verdict).toBe('green');
	});

	it('defers to the forge when no context is required, but not to silence', () => {
		expect(
			evaluateValidation(deferring(), {
				sha: 'abc',
				checks: [],
				aggregate: 'green',
			}).verdict,
		).toBe('green');
		expect(
			evaluateValidation(deferring(), { sha: 'abc', checks: [] }).verdict,
		).toBe('pending');
		expect(
			evaluateValidation(deferring(), {
				sha: 'abc',
				checks: [{ name: 'anything', state: 'failure' }],
			}).verdict,
		).toBe('red');
	});
});
