/**
 * spend-guard.spec.ts — the degrade-vs-hard-error decision (f00067 S7).
 */
import { describe, expect, it } from 'vitest';

import type {
	IProviderAvailability,
	IProviderCapabilities,
} from '@mcp-vertex/core/public';

import {
	decideSpendGuard,
	spendCheckForDecision,
	cheapestAvailableProvider,
	emptySpendLimitsView,
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

const breachedSession: ISpendLimitsView = {
	sessionSpendUsd: 12,
	sessionLimitUsd: 10,
	monthlySpendUsd: 12,
	monthlyLimitUsd: 100,
	breached: 'session',
};

describe('decideSpendGuard', () => {
	it('allows when nothing is breached', () => {
		const plan = decideSpendGuard({
			limits: emptySpendLimitsView(),
			fallbackStrategy: 'rerank',
			providers: [provider('a', 3)],
			availabilityOf: available,
		});
		expect(plan.action).toBe('allow');
	});

	it('degrades to the cheapest costTier<=1 provider under rerank', () => {
		const plan = decideSpendGuard({
			limits: breachedSession,
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
			fallbackStrategy: 'tier-down',
			providers: [provider('cheap', 1)],
			availabilityOf: available,
		});
		expect(plan.action).toBe('hard-error');
	});

	it('ignores unavailable cheap providers when choosing the degrade target', () => {
		const plan = decideSpendGuard({
			limits: breachedSession,
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
			limits: {
				sessionSpendUsd: 1,
				sessionLimitUsd: 100,
				monthlySpendUsd: 55,
				monthlyLimitUsd: 50,
				breached: 'monthly',
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
