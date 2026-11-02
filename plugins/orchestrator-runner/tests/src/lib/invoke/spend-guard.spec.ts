/**
 * spend-guard.spec.ts — the degrade-vs-hard-error decision (f00067 S7).
 */
import { describe, expect, it } from 'vitest';

import type {
	IProviderAvailability,
	IProviderCapabilities,
} from '@delendai/core/public';

import {
	decideSpendGuard,
	spendCheckForDecision,
	cheapestAvailableProvider,
	emptySpendLimitsView,
	spendCheckerFor,
	type ISpendLimitsView,
} from '../../../../src/lib/invoke/spend-guard';

const provider = (
	id: string,
	costTier: 1 | 2 | 3 | 4 | 5,
): IProviderCapabilities => ({
	id,
	kind: 'cli',
	invoke: { kind: 'cli', command: id, args: [] },
	modelId: `${id}-model`,
	contextWindow: 100_000,
	costTier,
	strengths: ['code-edit'],
	weaknesses: [],
});

const available = (id: string): IProviderAvailability => ({
	id,
	state: 'available',
});

/** The caps the breached views above were computed against. */
const CAPS = { sessionUsd: 10, monthlyUsd: 100 } as const;
const NO_CAPS = { sessionUsd: null, monthlyUsd: null } as const;

const withinBudget: ISpendLimitsView = {
	sessionSpendUsd: 2,
	sessionLimitUsd: 10,
	monthlySpendUsd: 2,
	monthlyLimitUsd: 100,
	breached: null,
	observed: 'known',
};

const breachedSession: ISpendLimitsView = {
	sessionSpendUsd: 12,
	sessionLimitUsd: 10,
	monthlySpendUsd: 12,
	monthlyLimitUsd: 100,
	breached: 'session',
	observed: 'known',
};

describe('decideSpendGuard', () => {
	it('allows when the spend was read and nothing is breached', () => {
		const plan = decideSpendGuard({
			limits: withinBudget,
			caps: CAPS,
			fallbackStrategy: 'rerank',
			providers: [provider('a', 3)],
			availabilityOf: available,
		});
		expect(plan.action).toBe('allow');
	});

	it('degrades to the cheapest costTier<=1 provider under rerank', () => {
		const plan = decideSpendGuard({
			limits: breachedSession,
			caps: CAPS,
			fallbackStrategy: 'rerank',
			providers: [provider('pricey', 3), provider('cheap', 1)],
			availabilityOf: available,
		});
		expect(plan).toEqual({
			action: 'degrade',
			scope: 'session',
			toProvider: 'cheap',
		});
	});

	it('hard-errors under rerank when no cheap tier exists', () => {
		const plan = decideSpendGuard({
			limits: breachedSession,
			caps: CAPS,
			fallbackStrategy: 'rerank',
			providers: [provider('pricey', 3), provider('mid', 2)],
			availabilityOf: available,
		});
		expect(plan.action).toBe('hard-error');
		if (plan.action === 'hard-error') {
			expect(plan.error.scope).toBe('session');
			expect(plan.error.limitUsd).toBe(10);
			expect(plan.error.observedUsd).toBe(12);
		}
	});

	it('hard-errors under tier-down even when a cheap tier exists', () => {
		const plan = decideSpendGuard({
			limits: breachedSession,
			caps: CAPS,
			fallbackStrategy: 'tier-down',
			providers: [provider('cheap', 1)],
			availabilityOf: available,
		});
		expect(plan.action).toBe('hard-error');
	});

	it('ignores unavailable cheap providers when choosing the degrade target', () => {
		const plan = decideSpendGuard({
			limits: breachedSession,
			caps: CAPS,
			fallbackStrategy: 'rerank',
			providers: [provider('cheap-down', 1), provider('cheap-up', 1)],
			availabilityOf: (id) =>
				id === 'cheap-down'
					? { id, state: 'quota-exceeded' }
					: { id, state: 'available' },
		});
		expect(plan).toMatchObject({
			action: 'degrade',
			toProvider: 'cheap-up',
		});
	});

	it('reports observed/limit from the monthly scope on a monthly breach', () => {
		const plan = decideSpendGuard({
			caps: { sessionUsd: 100, monthlyUsd: 50 },
			limits: {
				sessionSpendUsd: 1,
				sessionLimitUsd: 100,
				monthlySpendUsd: 55,
				monthlyLimitUsd: 50,
				breached: 'monthly',
				observed: 'known',
			},
			fallbackStrategy: 'tier-down',
			providers: [],
			availabilityOf: available,
		});
		if (plan.action === 'hard-error') {
			expect(plan.error.scope).toBe('monthly');
			expect(plan.error.observedUsd).toBe(55);
			expect(plan.error.limitUsd).toBe(50);
		} else {
			throw new Error('expected hard-error');
		}
	});
});

describe('cheapestAvailableProvider', () => {
	it('returns undefined when no tier<=1 provider is available', () => {
		expect(
			cheapestAvailableProvider({
				limits: breachedSession,
				caps: CAPS,
				fallbackStrategy: 'rerank',
				providers: [provider('mid', 2)],
				availabilityOf: available,
			}),
		).toBeUndefined();
	});
});

describe('spendCheckForDecision', () => {
	it('proceed on allow', () => {
		expect(spendCheckForDecision({ action: 'allow' }, 'x')).toEqual({
			outcome: 'proceed',
		});
	});

	it('block on hard-error carries the error', () => {
		const out = spendCheckForDecision(
			{
				action: 'hard-error',
				error: {
					scope: 'session',
					limitUsd: 10,
					observedUsd: 12,
					message: 'nope',
				},
			},
			'x',
		);
		expect(out).toEqual({
			outcome: 'block',
			error: {
				scope: 'session',
				limitUsd: 10,
				observedUsd: 12,
				message: 'nope',
			},
		});
	});

	it('proceed on the degrade target, skip everyone else', () => {
		const plan = {
			action: 'degrade',
			scope: 'session',
			toProvider: 'cheap',
		} as const;
		expect(spendCheckForDecision(plan, 'cheap')).toEqual({
			outcome: 'proceed',
		});
		expect(spendCheckForDecision(plan, 'pricey')).toMatchObject({
			outcome: 'skip',
		});
	});
});

describe('decideSpendGuard — spend that cannot be checked', () => {
	it('refuses under a configured cap, naming why the spend is unknown', () => {
		// The defect: an unreadable summary used to read as "nothing
		// breached", so a project with a monthly cap got no cap at all.
		const plan = decideSpendGuard({
			limits: emptySpendLimitsView(
				'could not read /x/usage-summary.json (ENOENT)',
			),
			caps: CAPS,
			fallbackStrategy: 'rerank',
			providers: [provider('a', 3), provider('cheap', 1)],
			availabilityOf: available,
		});
		expect(plan.action).toBe('unverifiable');
		if (plan.action !== 'unverifiable') return;
		expect(plan.reason).toContain('/x/usage-summary.json');
		expect(plan.reason).toContain('before any subprocess or HTTP call');
	});

	it('refuses under a session cap alone, and under a monthly cap alone', () => {
		for (const caps of [
			{ sessionUsd: 5, monthlyUsd: null },
			{ sessionUsd: null, monthlyUsd: 50 },
		]) {
			const plan = decideSpendGuard({
				limits: emptySpendLimitsView(),
				caps,
				fallbackStrategy: 'rerank',
				providers: [provider('a', 3)],
				availabilityOf: available,
			});
			expect(plan.action).toBe('unverifiable');
		}
	});

	it('treats a cap of zero as a cap', () => {
		const plan = decideSpendGuard({
			limits: emptySpendLimitsView(),
			caps: { sessionUsd: 0, monthlyUsd: null },
			fallbackStrategy: 'rerank',
			providers: [provider('a', 3)],
			availabilityOf: available,
		});
		expect(plan.action).toBe('unverifiable');
	});

	it('allows unknown spend when no cap is configured, because there is nothing to exceed', () => {
		const plan = decideSpendGuard({
			limits: emptySpendLimitsView(),
			caps: NO_CAPS,
			fallbackStrategy: 'rerank',
			providers: [provider('a', 3)],
			availabilityOf: available,
		});
		expect(plan.action).toBe('allow');
	});

	it('uses a default reason when none was given', () => {
		const plan = decideSpendGuard({
			limits: { ...withinBudget, observed: 'unknown' },
			caps: CAPS,
			fallbackStrategy: 'rerank',
			providers: [provider('a', 3)],
			availabilityOf: available,
		});
		expect(plan.action).toBe('unverifiable');
		if (plan.action !== 'unverifiable') return;
		expect(plan.reason).toContain('could not be read');
	});

	it('maps an unverifiable plan onto every hop as unverifiable', () => {
		expect(
			spendCheckForDecision(
				{ action: 'unverifiable', reason: 'why' },
				'any-provider',
			),
		).toEqual({ outcome: 'unverifiable', reason: 'why' });
	});
});

describe('spendCheckerFor — the checker the plugin wires into the manager', () => {
	it('reads the limits on every call, not once at construction', () => {
		let view: ISpendLimitsView = withinBudget;
		const check = spendCheckerFor({
			limits: () => view,
			caps: CAPS,
			providers: [provider('a', 3)],
			availabilityOf: available,
		});
		const hop = { targetProvider: { id: 'a' } };
		expect(check(hop, 'tier-down')).toEqual({ outcome: 'proceed' });
		view = breachedSession;
		expect(check(hop, 'tier-down').outcome).toBe('block');
		view = emptySpendLimitsView('the summary vanished');
		const refused = check(hop, 'tier-down');
		expect(refused.outcome).toBe('unverifiable');
	});

	it('degrades onto one cheap provider when several qualify, in roster order on a tie', () => {
		// Only tier 1 counts as cheap, so qualifying providers tie on cost;
		// the sort is stable and the roster's order decides.
		const check = spendCheckerFor({
			limits: () => breachedSession,
			caps: CAPS,
			providers: [
				provider('pricey', 4),
				provider('cheap-first', 1),
				provider('cheap-second', 1),
			],
			availabilityOf: available,
		});
		expect(
			check({ targetProvider: { id: 'cheap-first' } }, 'rerank'),
		).toEqual({ outcome: 'proceed' });
		expect(
			check({ targetProvider: { id: 'cheap-second' } }, 'rerank').outcome,
		).toBe('skip');
	});
});
