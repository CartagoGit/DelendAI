import { describe, expect, it } from 'vitest';

import {
	preferRoute,
	scoreRoute,
	type IPreferenceContext,
	type IRouteQuality,
} from '../../../../src/lib/routing/economic-preference';
import {
	describeRoute,
	type IRoute,
	type IRouteEconomics,
	type IRouteIdentityParts,
} from '../../../../src/lib/routing/route-identity';

const NOW = Date.UTC(2026, 8, 5, 12);
const MONTH = 30 * 24 * 3_600_000;

const route = (
	economics: Partial<IRouteEconomics>,
	parts: Partial<IRouteIdentityParts> = {},
): IRoute =>
	describeRoute(
		{
			provider: 'anthropic',
			account: 'work',
			accessMode: 'plan-included',
			runtime: 'claude-code',
			model: 'claude-opus-5',
			...parts,
		},
		{ billing: 'plan-included', marginalCost: 0, ...economics },
	);

const planRoute = (remaining: number, account = 'work'): IRoute =>
	route(
		{
			billing: 'plan-included',
			marginalCost: 0,
			quotaRemaining: remaining,
			quotaTotal: 1000,
			quotaResetsAt: NOW + MONTH,
		},
		{ account },
	);

const meteredRoute = (): IRoute =>
	route(
		{ billing: 'metered', marginalCost: 0.02 },
		{ account: 'api', accessMode: 'metered', runtime: 'sdk' },
	);

const quality = (score: number, confidence = 1): IRouteQuality => ({
	score,
	confidence,
});

const context = (
	partial: Partial<IPreferenceContext> = {},
): IPreferenceContext => ({ stakes: 'normal', ...partial });

describe('economic preference (f00507 S3)', () => {
	describe('the six economic cases from the handoff', () => {
		it('1. high quota beats low quota on the same model', () => {
			const outcome = preferRoute(
				[
					{ route: planRoute(800, 'work'), quality: quality(0.8) },
					{
						route: planRoute(100, 'personal'),
						quality: quality(0.8),
					},
				],
				context(),
				NOW,
			);

			expect(outcome.chosen?.route.parts.account).toBe('work');
		});

		it('2. included beats billed when results are equivalent', () => {
			// The cheapest correct decision available, and the one the
			// router could not previously express at all.
			const outcome = preferRoute(
				[
					{ route: meteredRoute(), quality: quality(0.8) },
					{ route: planRoute(800), quality: quality(0.8) },
				],
				context({ allowPaidUpgrade: true }),
				NOW,
			);

			expect(outcome.chosen?.route.economics.billing).toBe(
				'plan-included',
			);
		});

		it('3. payment disabled means the free route wins whatever the scores say', () => {
			// A fact about the world, not an opinion the ranker can talk
			// itself out of.
			const outcome = preferRoute(
				[
					{ route: meteredRoute(), quality: quality(0.99) },
					{ route: planRoute(800), quality: quality(0.4) },
				],
				context({ allowPaidUpgrade: false }),
				NOW,
			);

			expect(outcome.chosen?.route.economics.billing).toBe(
				'plan-included',
			);
			expect(outcome.reason).toContain('not authorised');
		});

		it('4. a nearly exhausted monthly quota is protected from trivial work', () => {
			const outcome = preferRoute(
				[
					{ route: planRoute(30, 'scarce'), quality: quality(0.9) },
					{ route: planRoute(900, 'roomy'), quality: quality(0.75) },
				],
				context({ stakes: 'trivial' }),
				NOW,
			);

			expect(outcome.chosen?.route.parts.account).toBe('roomy');
		});

		it('5. a substantial authorised improvement does win', () => {
			const outcome = preferRoute(
				[
					{ route: meteredRoute(), quality: quality(0.95) },
					{ route: planRoute(800), quality: quality(0.5) },
				],
				context({ stakes: 'high', allowPaidUpgrade: true }),
				NOW,
			);

			expect(outcome.chosen?.route.economics.billing).toBe('metered');
			expect(outcome.reason).toContain('authorised');
		});

		it('6. a learned preference cannot spend money without authorisation', () => {
			// Learning discovers which permitted route is best; it can
			// never widen what is permitted.
			const outcome = preferRoute(
				[
					{ route: meteredRoute(), quality: quality(1, 1) },
					{ route: planRoute(800), quality: quality(0.1, 1) },
				],
				context({ stakes: 'high' }),
				NOW,
			);

			expect(outcome.chosen?.route.economics.billing).toBe(
				'plan-included',
			);
		});
	});

	describe('a small quality edge never starts a bill on its own', () => {
		it('refuses a marginal upgrade even when authorised', () => {
			const outcome = preferRoute(
				[
					{ route: meteredRoute(), quality: quality(0.82) },
					{ route: planRoute(800), quality: quality(0.78) },
				],
				context({ allowPaidUpgrade: true }),
				NOW,
			);

			expect(outcome.chosen?.route.economics.billing).toBe(
				'plan-included',
			);
			expect(outcome.reason).toContain('below the');
		});

		it('sets a higher bar for trivial work than for high stakes', () => {
			const candidates = [
				{ route: meteredRoute(), quality: quality(0.9) },
				{ route: planRoute(800), quality: quality(0.6) },
			];

			expect(
				preferRoute(
					candidates,
					context({ stakes: 'trivial', allowPaidUpgrade: true }),
					NOW,
				).chosen?.route.economics.billing,
			).toBe('plan-included');
			expect(
				preferRoute(
					candidates,
					context({ stakes: 'high', allowPaidUpgrade: true }),
					NOW,
				).chosen?.route.economics.billing,
			).toBe('metered');
		});
	});

	describe('quality is discounted by the evidence behind it', () => {
		it('does not let one lucky call outrank a solid record', () => {
			const lucky = scoreRoute(
				planRoute(800, 'lucky'),
				quality(1, 0.1),
				context(),
				NOW,
			);
			const solid = scoreRoute(
				planRoute(800, 'solid'),
				quality(0.8, 1),
				context(),
				NOW,
			);

			expect(solid.score).toBeGreaterThan(lucky.score);
		});

		it('always explains how it scored', () => {
			const scored = scoreRoute(
				planRoute(50),
				quality(0.7, 0.8),
				context({ stakes: 'trivial' }),
				NOW,
			);

			expect(scored.reasons.join(' ')).toContain('confidence');
			expect(scored.reasons.join(' ')).toContain('quota is critical');
		});
	});

	describe('degenerate cases', () => {
		it('chooses nothing when nothing is eligible', () => {
			const outcome = preferRoute([], context(), NOW);

			expect(outcome.chosen).toBeUndefined();
			expect(outcome.reason).toContain('no eligible route');
		});

		it('picks the best billed route when every option bills', () => {
			const outcome = preferRoute(
				[
					{ route: meteredRoute(), quality: quality(0.6) },
					{
						route: route(
							{ billing: 'prepaid', marginalCost: 0.01 },
							{ account: 'prepaid', accessMode: 'prepaid' },
						),
						quality: quality(0.9),
					},
				],
				context(),
				NOW,
			);

			expect(outcome.chosen?.route.parts.account).toBe('prepaid');
			expect(outcome.reason).toContain('every eligible route bills');
		});

		it('returns the full ranking, not just the winner', () => {
			const outcome = preferRoute(
				[
					{ route: planRoute(800, 'a'), quality: quality(0.9) },
					{ route: planRoute(800, 'b'), quality: quality(0.5) },
				],
				context(),
				NOW,
			);

			expect(outcome.ranked).toHaveLength(2);
			expect(outcome.ranked[0]?.score).toBeGreaterThanOrEqual(
				outcome.ranked[1]?.score ?? 0,
			);
		});
	});
});
