import { describe, expect, it } from 'vitest';

import {
	preferRoute,
	type IPreferenceContext,
	type IRouteQuality,
} from '../../../../src/lib/routing/economic-preference';
import { explainSelection } from '../../../../src/lib/routing/selection-explain.service';
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

describe('selection explain (f00507 S4)', () => {
	it('explains the chosen route and every discarded alternative separately', () => {
		const outcome = preferRoute(
			[
				{ route: meteredRoute(), quality: quality(0.82) },
				{ route: planRoute(800), quality: quality(0.78) },
			],
			context({ allowPaidUpgrade: true }),
			NOW,
		);
		const explanation = explainSelection(outcome);

		expect(explanation.chosen?.billing).toBe('plan-included');
		expect(explanation.discarded).toHaveLength(1);
		expect(explanation.discarded[0]?.billing).toBe('metered');
		expect(explanation.discarded[0]?.reasons.join(' ')).toContain(
			'spends money',
		);
	});

	it('keeps the score components separate instead of collapsing them into one opaque total', () => {
		const explanation = explainSelection(
			preferRoute(
				[
					{ route: planRoute(50), quality: quality(0.7, 0.8) },
					{
						route: planRoute(800, 'other'),
						quality: quality(0.7, 0.8),
					},
				],
				context({ stakes: 'trivial' }),
				NOW,
			),
		);

		expect(explanation.chosen?.components).toEqual(
			expect.objectContaining({
				qualityEvidence: expect.any(Number),
				alreadyPaidBonus: expect.any(Number),
				scarcityPenalty: expect.any(Number),
				headroomTiebreak: expect.any(Number),
				total: explanation.chosen?.score,
			}),
		);
	});

	it('contains only data, rules and metrics, never hidden model reasoning', () => {
		const explanation = explainSelection(
			preferRoute(
				[
					{ route: planRoute(800), quality: quality(0.8) },
					{ route: meteredRoute(), quality: quality(0.95) },
				],
				context({ allowPaidUpgrade: false }),
				NOW,
			),
		);

		expect(Object.keys(explanation).sort()).toEqual([
			'chosen',
			'discarded',
			'metrics',
			'reason',
		]);
		expect(explanation.reason).toContain('not authorised');
		expect(explanation.metrics).toEqual({
			candidateCount: 2,
			alreadyPaidCount: 1,
			billedCount: 1,
		});
	});

	it('declares fallback order and reason explicitly', () => {
		const primary = planRoute(800);
		const secondary = meteredRoute();
		const explanation = explainSelection(preferRoute([], context(), NOW), {
			order: [primary, secondary],
			reason: 'the primary route is unhealthy, so retry in the previously ranked order instead of silently defaulting to the cheapest route',
		});

		expect(explanation.fallback).toEqual({
			order: [primary.identity, secondary.identity],
			reason: 'the primary route is unhealthy, so retry in the previously ranked order instead of silently defaulting to the cheapest route',
		});
	});
});
