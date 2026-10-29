import { describe, expect, it } from 'vitest';

import {
	describeRoute,
	parseRouteIdentity,
	quotaScarcity,
	routeIdentity,
	spendsMoney,
	type IRouteEconomics,
	type IRouteIdentityParts,
	type TBillingMode,
} from '../../../../src/lib/routing/route-identity';

const parts = (
	partial: Partial<IRouteIdentityParts> = {},
): IRouteIdentityParts => ({
	provider: 'anthropic',
	account: 'work',
	accessMode: 'plan-included',
	runtime: 'claude-code',
	model: 'claude-opus-5',
	...partial,
});

const economics = (
	partial: Partial<IRouteEconomics> = {},
): IRouteEconomics => ({
	billing: 'plan-included',
	marginalCost: 0,
	...partial,
});

const NOW = Date.UTC(2026, 8, 5, 12);
const HOUR = 3_600_000;

describe('route identity and economics (f00507 S1)', () => {
	describe('identity', () => {
		it('combines all five parts and is stable between sessions', () => {
			expect(routeIdentity(parts())).toBe(
				'anthropic:work:plan-included:claude-code:claude-opus-5',
			);
			expect(routeIdentity(parts())).toBe(routeIdentity(parts()));
		});

		it('gives three routes to one model three identities', () => {
			// One capability, three economies — the distinction the router
			// could not previously express.
			const identities = new Set([
				routeIdentity(parts({ accessMode: 'plan-included' })),
				routeIdentity(
					parts({ accessMode: 'subscription', account: 'personal' }),
				),
				routeIdentity(parts({ accessMode: 'metered', runtime: 'sdk' })),
			]);

			expect(identities.size).toBe(3);
		});

		it('distinguishes two accounts on the same provider and model', () => {
			expect(routeIdentity(parts({ account: 'work' }))).not.toBe(
				routeIdentity(parts({ account: 'personal' })),
			);
		});

		it('splits back into exactly five parts', () => {
			expect(parseRouteIdentity(routeIdentity(parts()))).toEqual([
				'anthropic',
				'work',
				'plan-included',
				'claude-code',
				'claude-opus-5',
			]);
		});

		it('survives a segment containing the separator', () => {
			// An identity that could not be split back would silently
			// merge two routes in a budget.
			const awkward = parts({ account: 'team:eu', model: 'a:b' });

			expect(parseRouteIdentity(routeIdentity(awkward))).toEqual([
				'anthropic',
				'team:eu',
				'plan-included',
				'claude-code',
				'a:b',
			]);
		});

		it('does not let a colon in one segment collide with another route', () => {
			expect(
				routeIdentity(parts({ provider: 'a:b', account: 'c' })),
			).not.toBe(routeIdentity(parts({ provider: 'a', account: 'b:c' })));
		});

		it('carries identity and economics together on a described route', () => {
			const route = describeRoute(
				parts(),
				economics({ marginalCost: 0 }),
			);

			expect(route.identity).toContain('anthropic');
			expect(route.economics.billing).toBe('plan-included');
			expect(route.parts.model).toBe('claude-opus-5');
		});
	});

	describe('scarcity is not money', () => {
		it('reads a plan with plenty left as ample despite costing nothing', () => {
			// A zero marginal cost does not mean infinite quota. Folding
			// scarcity into cost is how a router burns its reserve on
			// trivial work.
			const route = economics({
				marginalCost: 0,
				quotaRemaining: 800,
				quotaTotal: 1000,
				quotaResetsAt: NOW + 30 * 24 * HOUR,
			});

			expect(quotaScarcity(route, NOW)).toBe('ample');
			expect(spendsMoney(route)).toBe(false);
		});

		it('reads the last tenth of a monthly quota as critical', () => {
			expect(
				quotaScarcity(
					economics({
						quotaRemaining: 90,
						quotaTotal: 1000,
						quotaResetsAt: NOW + 20 * 24 * HOUR,
					}),
					NOW,
				),
			).toBe('critical');
		});

		it('reads a middling quota as tight', () => {
			expect(
				quotaScarcity(
					economics({
						quotaRemaining: 300,
						quotaTotal: 1000,
						quotaResetsAt: NOW + 20 * 24 * HOUR,
					}),
					NOW,
				),
			).toBe('tight');
		});

		it('does not treat a quota refilling within the hour as scarce', () => {
			// Spending it costs almost nothing: it comes back before it is
			// needed again. Treating this like the last of a monthly quota
			// makes the router hoard something it should be using.
			expect(
				quotaScarcity(
					economics({
						quotaRemaining: 100,
						quotaTotal: 1000,
						quotaResetsAt: NOW + 15 * 60_000,
					}),
					NOW,
				),
			).toBe('ample');
		});

		it('still notices a nearly empty quota even when it refills soon', () => {
			expect(
				quotaScarcity(
					economics({
						quotaRemaining: 10,
						quotaTotal: 1000,
						quotaResetsAt: NOW + 15 * 60_000,
					}),
					NOW,
				),
			).toBe('tight');
		});

		it('has no opinion when the route has no quota at all', () => {
			expect(quotaScarcity(economics({ billing: 'metered' }), NOW)).toBe(
				'none',
			);
			expect(
				quotaScarcity(
					economics({ quotaRemaining: 5, quotaTotal: 0 }),
					NOW,
				),
			).toBe('none');
		});

		it('treats a missing reset time as far away rather than as imminent', () => {
			expect(
				quotaScarcity(
					economics({ quotaRemaining: 50, quotaTotal: 1000 }),
					NOW,
				),
			).toBe('critical');
		});
	});

	describe('what counts as spending money', () => {
		it('is false for the three that are already paid for', () => {
			const free: readonly TBillingMode[] = [
				'local',
				'free',
				'plan-included',
			];

			for (const billing of free) {
				expect(
					spendsMoney(economics({ billing, marginalCost: 0 })),
				).toBe(false);
			}
		});

		it('is true for prepaid and metered', () => {
			for (const billing of ['prepaid', 'metered'] as const) {
				expect(spendsMoney(economics({ billing }))).toBe(true);
			}
		});

		it('treats unknown billing as spending, never as free', () => {
			// Assuming otherwise is the one mistake that costs the user
			// real money without being asked.
			expect(
				spendsMoney(economics({ billing: 'unknown', marginalCost: 0 })),
			).toBe(true);
		});

		it('is true whenever a marginal cost was declared, whatever the mode says', () => {
			expect(
				spendsMoney(
					economics({ billing: 'plan-included', marginalCost: 0.02 }),
				),
			).toBe(true);
		});
	});
});
