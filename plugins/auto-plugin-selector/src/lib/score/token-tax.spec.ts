/**
 * token-tax.spec.ts — r00025 S1 acceptance: the token-tax signal is
 * a pure 0..1 score, deterministic, and refuses to surface a "cheap"
 * verdict when the candidate already breaks the hard cap.
 */
import { describe, expect, it } from 'vitest';

import { scoreTokenTax } from './token-tax';

describe('scoreTokenTax (r00025 S1)', () => {
	it('returns the neutral 0.5 when the candidate has no budget declared', () => {
		expect(scoreTokenTax({ tokenBudget: undefined })).toBe(0.5);
		expect(scoreTokenTax({ tokenBudget: null })).toBe(0.5);
		expect(scoreTokenTax({})).toBe(0.5);
	});

	it('treats a legacy number budget as cheap when well below the reference (cold-start)', () => {
		// 200 tokens against a 3000-token reference → very cheap.
		expect(scoreTokenTax({ tokenBudget: 200 })).toBeGreaterThan(0.9);
	});

	it('returns 0 when a legacy number budget reaches the reference (hard-cap break)', () => {
		expect(scoreTokenTax({ tokenBudget: 3_000 })).toBe(0);
		expect(scoreTokenTax({ tokenBudget: 9_999 })).toBe(0);
	});

	it('normalises the structured ITokenBudgetCeiling form against the hard ceiling', () => {
		const cheap = scoreTokenTax({
			tokenBudget: {
				hard: 500,
				warning: 400,
				releaseRelativePercent: 20,
			},
		});
		const expensive = scoreTokenTax({
			tokenBudget: {
				hard: 2_500,
				warning: 2_200,
				releaseRelativePercent: 20,
			},
		});
		expect(cheap).toBeGreaterThan(expensive);
		expect(cheap).toBeGreaterThan(0.8);
		expect(expensive).toBeLessThan(0.5);
	});

	it('honors the f00179 caps.hard field when it is present (mixed scenarios)', () => {
		// A manifest where caps.hard = 1_000 makes this candidate mid-priced
		// even though the outer hard is large (some hosts compute caps based
		// on the actual surface, not the declaration).
		const score = scoreTokenTax({
			tokenBudget: {
				hard: 9_999,
				warning: 9_000,
				releaseRelativePercent: 20,
				caps: { hard: 1_000 },
			} as never,
		});
		expect(score).toBeGreaterThan(0.4);
		expect(score).toBeLessThan(0.8);
	});

	it('clamps the output to the closed [0, 1] interval even on extreme inputs', () => {
		const tiny = scoreTokenTax({ tokenBudget: 0 });
		const huge = scoreTokenTax({
			tokenBudget: {
				hard: 100_000,
				warning: 99_000,
				releaseRelativePercent: 20,
			},
		});
		expect(tiny).toBeGreaterThanOrEqual(0);
		expect(tiny).toBeLessThanOrEqual(1);
		expect(huge).toBeGreaterThanOrEqual(0);
		expect(huge).toBeLessThanOrEqual(1);
	});

	it('is pure: same input always yields the same output', () => {
		const input = { tokenBudget: 1_500 };
		expect(scoreTokenTax(input)).toBe(scoreTokenTax(input));
	});
});
