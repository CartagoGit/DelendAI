import { describe, expect, it } from 'vitest';

import { scoreOptimizationCandidate } from '../../src/lib/services/optimization-scoring.service';

describe('scoreOptimizationCandidate', () => {
	it('penalizes permission risk, token cost and latency for otherwise equal candidates', () => {
		const safer = scoreOptimizationCandidate(
			{ id: 'safe' },
			{
				successRate: 0.8,
				tokenCost: 200,
				latencyMs: 200,
				relevance: 0.8,
				confidence: 0.8,
				permissionRisk: 0,
			},
		);
		const riskier = scoreOptimizationCandidate(
			{ id: 'risky' },
			{
				successRate: 0.8,
				tokenCost: 3200,
				latencyMs: 2600,
				relevance: 0.8,
				confidence: 0.8,
				permissionRisk: 8,
			},
		);

		expect(riskier.tokenTax).toBeGreaterThan(safer.tokenTax);
		expect(riskier.latencyTax).toBeGreaterThan(safer.latencyTax);
		expect(riskier.permissionRisk).toBeGreaterThan(safer.permissionRisk);
		expect(riskier.score).toBeLessThan(safer.score);
	});

	it('rewards higher utility, relevance and confidence', () => {
		const weaker = scoreOptimizationCandidate(
			{ id: 'weak' },
			{
				successRate: 0.45,
				tokenCost: 250,
				latencyMs: 300,
				relevance: 0.3,
				confidence: 0.3,
				permissionRisk: 0,
			},
		);
		const stronger = scoreOptimizationCandidate(
			{ id: 'strong' },
			{
				successRate: 0.9,
				tokenCost: 250,
				latencyMs: 300,
				relevance: 0.9,
				confidence: 0.9,
				permissionRisk: 0,
			},
		);

		expect(stronger.utility).toBeGreaterThan(weaker.utility);
		expect(stronger.score).toBeGreaterThan(weaker.score);
	});

	it('derives permission risk from candidate permissions when the signal omits it', () => {
		const withoutPermissions = scoreOptimizationCandidate(
			{ id: 'none' },
			{
				successRate: 0.7,
				tokenCost: 300,
				latencyMs: 250,
				relevance: 0.7,
				confidence: 0.7,
			},
		);
		const withPermissions = scoreOptimizationCandidate(
			{ id: 'perm', permissions: ['filesystem-read', 'secrets'] },
			{
				successRate: 0.7,
				tokenCost: 300,
				latencyMs: 250,
				relevance: 0.7,
				confidence: 0.7,
			},
		);

		expect(withPermissions.permissionRisk).toBeGreaterThan(0);
		expect(withPermissions.score).toBeLessThan(withoutPermissions.score);
	});

	it('clamps the final score to the 0..100 range', () => {
		const maxed = scoreOptimizationCandidate(
			{ id: 'maxed' },
			{
				successRate: 1,
				tokenCost: 0,
				latencyMs: 0,
				relevance: 1,
				confidence: 1,
				permissionRisk: 0,
			},
		);
		const crushed = scoreOptimizationCandidate(
			{ id: 'crushed', permissions: ['secrets', 'container'] },
			{
				successRate: 0,
				tokenCost: 40_000,
				latencyMs: 40_000,
				relevance: 0,
				confidence: 0,
				permissionRisk: 50,
			},
		);

		expect(maxed.score).toBe(100);
		expect(crushed.score).toBe(0);
	});

	it('is deterministic for the same input', () => {
		const candidate = {
			id: 'same',
			permissions: ['network'] as const,
		};
		const signals = {
			successRate: 0.62,
			tokenCost: 640,
			latencyMs: 820,
			relevance: 0.58,
			confidence: 0.73,
		};

		expect(scoreOptimizationCandidate(candidate, signals)).toEqual(
			scoreOptimizationCandidate(candidate, signals),
		);
	});
});
