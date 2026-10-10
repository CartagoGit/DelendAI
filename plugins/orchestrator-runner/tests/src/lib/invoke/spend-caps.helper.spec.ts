/**
 * spend-caps.helper.spec.ts — the caps come from configuration.
 */
import { describe, expect, it } from 'vitest';

import { spendCapsFrom } from '../../../../src/lib/invoke/spend-caps.helper';

describe('spendCapsFrom', () => {
	it('reads both caps from the usage-tracking options', () => {
		expect(
			spendCapsFrom({ maxSessionSpendUsd: 5, maxMonthlySpendUsd: 50 }),
		).toEqual({ sessionUsd: 5, monthlyUsd: 50 });
	});

	it('has no caps when usage-tracking is absent or declares none', () => {
		expect(spendCapsFrom(undefined)).toEqual({
			sessionUsd: null,
			monthlyUsd: null,
		});
		expect(spendCapsFrom({})).toEqual({
			sessionUsd: null,
			monthlyUsd: null,
		});
	});

	it('keeps a cap of zero, which forbids any spend', () => {
		expect(spendCapsFrom({ maxSessionSpendUsd: 0 }).sessionUsd).toBe(0);
	});

	it('ignores a value that is not a usable amount', () => {
		expect(
			spendCapsFrom({
				maxSessionSpendUsd: -1,
				maxMonthlySpendUsd: Number.NaN,
			}),
		).toEqual({ sessionUsd: null, monthlyUsd: null });
		expect(
			spendCapsFrom({ maxMonthlySpendUsd: '50' }).monthlyUsd,
		).toBeNull();
	});
});
