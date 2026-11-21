import { describe, expect, it } from 'vitest';

import {
	checkEligibility,
	eligibleRoutes,
	GATE_ORDER,
	type IRouteRuntime,
	type IRoutingAuthorisation,
	type IRoutingRequest,
} from '../../../../src/lib/routing/eligibility-gates';
import {
	describeRoute,
	type IRoute,
	type IRouteEconomics,
	type IRouteIdentityParts,
} from '../../../../src/lib/routing/route-identity';

const route = (
	economics: Partial<IRouteEconomics> = {},
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

const runtime = (partial: Partial<IRouteRuntime> = {}): IRouteRuntime => ({
	capabilities: ['text', 'tools'],
	healthy: true,
	...partial,
});

const request = (partial: Partial<IRoutingRequest> = {}): IRoutingRequest => ({
	requiredCapabilities: [],
	estimatedCost: 0,
	estimatedQuotaUnits: 1,
	...partial,
});

const check = (
	economics: Partial<IRouteEconomics> = {},
	overrides: {
		runtime?: Partial<IRouteRuntime>;
		request?: Partial<IRoutingRequest>;
		auth?: IRoutingAuthorisation;
	} = {},
) =>
	checkEligibility(
		route(economics),
		runtime(overrides.runtime),
		request(overrides.request),
		overrides.auth ?? {},
	);

describe('eligibility gates (f00507 S2)', () => {
	describe('the gates run in order, and the first refusal is the true one', () => {
		it('declares the order the proposal specifies', () => {
			expect(GATE_ORDER).toEqual([
				'authorisation',
				'entitlement',
				'budget',
				'capabilities',
				'health',
				'quota',
			]);
		});

		it('reports authorisation, not a later gate, when the user forbade the route', () => {
			// "The user forbade it" is a different conversation from "it
			// lacks vision support", and an operator needs the true one.
			const forbidden = route({ billing: 'metered', marginalCost: 5 });
			const verdict = checkEligibility(
				forbidden,
				runtime({ capabilities: [], healthy: false }),
				request({ requiredCapabilities: ['vision'] }),
				{ deniedRoutes: [forbidden.identity] },
			);

			expect(verdict.refusedBy).toBe('authorisation');
		});

		it('reports entitlement before capabilities', () => {
			const verdict = check(
				{ billing: 'metered', marginalCost: 1 },
				{
					runtime: { capabilities: [] },
					request: { requiredCapabilities: ['vision'] },
				},
			);

			expect(verdict.refusedBy).toBe('entitlement');
		});
	});

	describe('an unauthorised route cannot be reached by scoring well', () => {
		it('never enters the candidate set the ranker sees', () => {
			// The structural guarantee: gating and ranking are separate
			// phases, so no score can promote a refused route.
			const allowed = route({}, { account: 'work' });
			const forbidden = route(
				{ billing: 'metered', marginalCost: 3 },
				{ account: 'personal', accessMode: 'metered' },
			);

			const { eligible, refused } = eligibleRoutes(
				[
					{ route: allowed, runtime: runtime() },
					{ route: forbidden, runtime: runtime() },
				],
				request(),
			);

			expect(eligible.map((entry) => entry.identity)).toEqual([
				allowed.identity,
			]);
			expect(refused[0]?.refusedBy).toBe('entitlement');
		});

		it('refuses the whole set when nothing is authorised, rather than falling back', () => {
			const { eligible, refused } = eligibleRoutes(
				[
					{
						route: route({ billing: 'metered', marginalCost: 1 }),
						runtime: runtime(),
					},
					{
						route: route(
							{ billing: 'prepaid', marginalCost: 1 },
							{ account: 'other' },
						),
						runtime: runtime(),
					},
				],
				request(),
			);

			expect(eligible).toEqual([]);
			expect(refused).toHaveLength(2);
		});
	});

	describe('what is enabled by default', () => {
		it('allows the three that are already paid for', () => {
			for (const billing of ['local', 'free', 'plan-included'] as const) {
				expect(check({ billing }).eligible, billing).toBe(true);
			}
		});

		it('refuses prepaid and metered until the user turns them on', () => {
			for (const billing of ['prepaid', 'metered'] as const) {
				expect(check({ billing, marginalCost: 1 }).eligible).toBe(
					false,
				);
			}
		});

		it('refuses unknown billing, which is not a synonym for free', () => {
			const verdict = check({ billing: 'unknown' });

			expect(verdict.eligible).toBe(false);
			expect(verdict.reason).toContain('never established');
		});

		it('allows a billing mode once the user enables it', () => {
			expect(
				check(
					{ billing: 'metered', marginalCost: 1 },
					{ auth: { enabledBilling: ['metered'] } },
				).eligible,
			).toBe(true);
		});

		it('honours an explicit allow-list', () => {
			const wanted = route();

			expect(
				checkEligibility(wanted, runtime(), request(), {
					allowedRoutes: [wanted.identity],
				}).eligible,
			).toBe(true);
			expect(
				checkEligibility(wanted, runtime(), request(), {
					allowedRoutes: ['something:else:local:cli:model'],
				}).eligible,
			).toBe(false);
		});
	});

	describe('an authorised budget is a limit, not a target', () => {
		it('refuses a call above the per-call ceiling even with period budget left', () => {
			const verdict = check(
				{ billing: 'metered', marginalCost: 1 },
				{
					request: { estimatedCost: 12 },
					auth: {
						enabledBilling: ['metered'],
						maxCostPerCall: 5,
						remainingPeriodBudget: 1000,
					},
				},
			);

			expect(verdict.refusedBy).toBe('budget');
			expect(verdict.reason).toContain('does not license one');
		});

		it('refuses a call that exceeds what remains of the period', () => {
			expect(
				check(
					{ billing: 'metered', marginalCost: 1 },
					{
						request: { estimatedCost: 8 },
						auth: {
							enabledBilling: ['metered'],
							remainingPeriodBudget: 3,
						},
					},
				).refusedBy,
			).toBe('budget');
		});

		it('does not apply a money budget to a route that costs no money', () => {
			expect(
				check(
					{ billing: 'plan-included', marginalCost: 0 },
					{
						request: { estimatedCost: 0 },
						auth: { maxCostPerCall: 0, remainingPeriodBudget: 0 },
					},
				).eligible,
			).toBe(true);
		});
	});

	describe('capability, health and quota', () => {
		it('refuses a route that cannot do the job', () => {
			const verdict = check(
				{},
				{
					request: { requiredCapabilities: ['vision'] },
					runtime: { capabilities: ['text'] },
				},
			);

			expect(verdict.refusedBy).toBe('capabilities');
			expect(verdict.reason).toContain('vision');
		});

		it('refuses an unhealthy route rather than spending a retry on it', () => {
			expect(check({}, { runtime: { healthy: false } }).refusedBy).toBe(
				'health',
			);
		});

		it('refuses a call larger than the quota that remains', () => {
			expect(
				check(
					{ quotaRemaining: 3, quotaTotal: 100 },
					{ request: { estimatedQuotaUnits: 10 } },
				).refusedBy,
			).toBe('quota');
		});

		it('protects a critically scarce reserve from trivial work', () => {
			// Not a shortage but a judgement: burning the last of a plan on
			// a typo is how it runs out before the task that needed it.
			const verdict = check(
				{
					quotaRemaining: 20,
					quotaTotal: 1000,
					quotaResetsAt: Date.now() + 20 * 24 * 3_600_000,
				},
				{ request: { isTrivial: true, estimatedQuotaUnits: 1 } },
			);

			expect(verdict.refusedBy).toBe('quota');
			expect(verdict.reason).toContain(
				'worth more on work that needs it',
			);
		});

		it('still allows non-trivial work onto a scarce reserve', () => {
			expect(
				check(
					{
						quotaRemaining: 20,
						quotaTotal: 1000,
						quotaResetsAt: Date.now() + 20 * 24 * 3_600_000,
					},
					{ request: { isTrivial: false, estimatedQuotaUnits: 1 } },
				).eligible,
			).toBe(true);
		});

		it('does not protect a quota that refills within the hour', () => {
			expect(
				check(
					{
						quotaRemaining: 100,
						quotaTotal: 1000,
						quotaResetsAt: Date.now() + 15 * 60_000,
					},
					{ request: { isTrivial: true } },
				).eligible,
			).toBe(true);
		});
	});
});
