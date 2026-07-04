import { describe, expect, it } from 'vitest';

import type {
	IProviderAvailability,
	IProviderCapabilities,
	ProviderState,
} from '@mcp-vertex/core/public';

import type { IRoutingHint } from '../../../../src/lib/types';
import {
	MODE_TIER,
	UNAVAILABLE_SCORE,
	explainScore,
	scoreProvider,
} from '../../../../src/lib/router/score';

const provider = (
	over: Partial<IProviderCapabilities> = {},
): IProviderCapabilities => ({
	id: 'p',
	kind: 'api',
	invoke: { kind: 'api', url: 'https://x/v1', envVar: 'X_KEY' },
	modelId: 'model-x',
	contextWindow: 128_000,
	costTier: 3,
	strengths: [],
	weaknesses: [],
	...over,
});

const avail = (state: ProviderState = 'available'): IProviderAvailability => ({
	id: 'p',
	state,
});

const hint = (over: Partial<IRoutingHint> = {}): IRoutingHint => ({
	mode: 'implement',
	capabilities: [],
	costPref: 'balanced',
	...over,
});

describe('MODE_TIER (CRITICAL N10)', () => {
	it('maps review to 3 (not 4) and is frozen', () => {
		expect(MODE_TIER).toEqual({
			plan: 4,
			review: 3,
			implement: 2,
			explore: 1,
		});
		expect(Object.isFrozen(MODE_TIER)).toBe(true);
	});
});

describe('scoreProvider', () => {
	it('hard-penalises every non-available state to UNAVAILABLE_SCORE', () => {
		const states: ProviderState[] = [
			'quota-exceeded',
			'rate-limited',
			'unauthenticated',
			'not-installed',
			'model-unavailable',
			'error',
		];
		for (const state of states) {
			expect(scoreProvider(provider(), hint(), avail(state))).toBe(
				UNAVAILABLE_SCORE,
			);
		}
	});

	it('rewards matching strengths (+2) and penalises weaknesses (-3)', () => {
		const p = provider({
			strengths: ['code-edit'],
			weaknesses: ['vision'],
			costTier: 1,
		});
		// implement target tier = 2; costTier 1 < 2 → no +1, not > 3 → no -1.
		const s = scoreProvider(
			p,
			hint({ capabilities: ['code-edit', 'vision'] }),
			avail(),
		);
		expect(s).toBe(2 - 3);
	});

	it('adds +1 when costTier >= mode target and -1 when it is well above', () => {
		// explore target = 1. costTier 3 (>1 → +1, >2 → -1) balanced.
		expect(
			scoreProvider(
				provider({ costTier: 3 }),
				hint({ mode: 'explore' }),
				avail(),
			),
		).toBe(1 - 1);
		// plan target = 4. costTier 4 (>=4 → +1, not >5 → no -1).
		expect(
			scoreProvider(
				provider({ costTier: 4 }),
				hint({ mode: 'plan' }),
				avail(),
			),
		).toBe(1);
	});

	it('rewards minimize with a cheap tier and maximize with a premium tier', () => {
		// minimize + costTier 2 (<=2 → +2). implement target 2, costTier2>=2 → +1.
		expect(
			scoreProvider(
				provider({ costTier: 2 }),
				hint({ costPref: 'minimize' }),
				avail(),
			),
		).toBe(2 + 1);
		// maximize + costTier 5 (>=4 → +2). implement target 2, 5>=2 → +1, 5>3 → -1.
		expect(
			scoreProvider(
				provider({ costTier: 5 }),
				hint({ costPref: 'maximize' }),
				avail(),
			),
		).toBe(2 + 1 - 1);
	});

	it('gives a neutral 0 to a plain match with no signals', () => {
		// implement target 2, costTier 1 (<2), balanced, no caps.
		expect(scoreProvider(provider({ costTier: 1 }), hint(), avail())).toBe(
			0,
		);
	});
});

describe('explainScore', () => {
	it('returns the unavailable reason and score for a down provider', () => {
		const { score, reasons } = explainScore(
			provider(),
			hint(),
			avail('quota-exceeded'),
		);
		expect(score).toBe(UNAVAILABLE_SCORE);
		expect(reasons).toHaveLength(1);
		expect(reasons[0]).toContain('quota-exceeded');
	});

	it('emits a reason per applied rule and totals to the same score', () => {
		const p = provider({
			costTier: 5,
			strengths: ['reasoning'],
			weaknesses: ['fast-iteration'],
		});
		const h = hint({
			mode: 'plan',
			capabilities: ['reasoning', 'fast-iteration'],
			costPref: 'maximize',
		});
		const { score, reasons } = explainScore(p, h, avail());
		expect(score).toBe(scoreProvider(p, h, avail()));
		expect(reasons.some((r) => r.includes('strength:reasoning'))).toBe(
			true,
		);
		expect(reasons.some((r) => r.includes('weakness:fast-iteration'))).toBe(
			true,
		);
		expect(reasons.some((r) => r.includes('maximize'))).toBe(true);
	});

	it('explains a no-signal match with an explicit zero reason', () => {
		const { score, reasons } = explainScore(
			provider({ costTier: 1 }),
			hint(),
			avail(),
		);
		expect(score).toBe(0);
		expect(reasons).toEqual(['0 no matching signals']);
	});
});
