import { describe, expect, it } from 'vitest';

import type {
	IProviderAvailability,
	IProviderCapabilities,
} from '@mcp-vertex/core/public';

import type { IRoutingHint } from '../../../../src/lib/types';
import { planFallbackChain } from '../../../../src/lib/invoke/fallback';

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
	// All equally strong on the hinted capability so ordering is driven by tier,
	// keeping the chain's shape predictable.
	strengths: ['code-edit'],
	weaknesses: [],
});

const hint: IRoutingHint = {
	mode: 'implement',
	capabilities: ['code-edit'],
	costPref: 'balanced',
};

const available = (id: string): IProviderAvailability => ({
	id,
	state: 'available',
});

const base = {
	availabilityOf: available,
	hint,
	prompt: 'do the thing',
	sessionId: 's1',
} as const;

describe('planFallbackChain (CRITICAL I7)', () => {
	it('returns an empty chain when there are no providers', () => {
		expect(
			planFallbackChain({
				...base,
				providers: [],
				strategy: 'rerank',
				maxDepth: 3,
			}),
		).toEqual([]);
	});

	it('returns an empty chain when every provider is unavailable', () => {
		expect(
			planFallbackChain({
				...base,
				providers: [provider('a', 2), provider('b', 3)],
				availabilityOf: (id) => ({ id, state: 'quota-exceeded' }),
				strategy: 'rerank',
				maxDepth: 3,
			}),
		).toEqual([]);
	});

	it('yields just the primary when maxDepth is 1', () => {
		const chain = planFallbackChain({
			...base,
			providers: [provider('a', 2), provider('b', 1)],
			strategy: 'rerank',
			maxDepth: 1,
		});
		expect(chain).toHaveLength(1);
		expect(chain[0]?.scoringTrace.length).toBeGreaterThan(0);
	});

	it('never exceeds maxDepth and never repeats a provider', () => {
		const providers = [
			provider('a', 1),
			provider('b', 2),
			provider('c', 3),
			provider('d', 4),
		];
		const chain = planFallbackChain({
			...base,
			providers,
			strategy: 'rerank',
			maxDepth: 3,
		});
		expect(chain.length).toBeLessThanOrEqual(3);
		const ids = chain.map((d) => d.targetProvider.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('tier-down walks strictly cheaper each hop', () => {
		const providers = [
			provider('t1', 1),
			provider('t2', 2),
			provider('t3', 3),
			provider('t4', 4),
		];
		const chain = planFallbackChain({
			...base,
			providers,
			strategy: 'tier-down',
			maxDepth: 5,
		});
		for (let i = 1; i < chain.length; i += 1) {
			expect(chain[i]?.estimatedCostTier).toBeLessThan(
				chain[i - 1]?.estimatedCostTier ?? 99,
			);
		}
	});

	it('carries the full scoring trace only on the primary; fallbacks are self-contained', () => {
		const providers = [
			provider('a', 2),
			provider('b', 3),
			provider('c', 1),
		];
		const chain = planFallbackChain({
			...base,
			providers,
			strategy: 'rerank',
			maxDepth: 3,
		});
		expect(chain[0]?.scoringTrace.length).toBeGreaterThan(0);
		for (let i = 1; i < chain.length; i += 1) {
			expect(chain[i]?.scoringTrace).toHaveLength(0);
			expect(chain[i]?.alternates).toHaveLength(0);
		}
	});

	it('excludes providers the availability mirror marks down', () => {
		const providers = [provider('up', 2), provider('down', 1)];
		const chain = planFallbackChain({
			...base,
			providers,
			availabilityOf: (id) =>
				id === 'down'
					? { id, state: 'error' }
					: { id, state: 'available' },
			strategy: 'tier-down',
			maxDepth: 3,
		});
		expect(chain.map((d) => d.targetProvider.id)).not.toContain('down');
	});
});
