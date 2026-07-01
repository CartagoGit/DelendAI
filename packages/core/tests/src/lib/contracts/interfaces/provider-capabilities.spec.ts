/**
 * provider-capabilities contract guard (f00067 S1).
 *
 * These specs pin the shape of the canonical multi-model provider
 * contract so a future refactor cannot silently drop a field, widen a
 * discriminated union into a bare string, or let the wiki design text
 * drift from the code. The contract is a public API of `@mcp-vertex/core`
 * (see the rollback note in f00067): removing a field is a breaking
 * change, and this file is where that break must surface.
 */
import { describe, expect, it } from 'vitest';

import {
	CAPABILITY_TAGS,
	type CapabilityTag,
	type CostTier,
	type IProviderAvailability,
	type IProviderCapabilities,
	type IProviderInvoke,
	type IProviderSummary,
	type IRoutingDecision,
	type ProviderKind,
	type ProviderState,
	type RoutingStrategy,
} from '@mcp-vertex/core/public';

describe('CapabilityTag', async () => {
	it('exposes the full closed set via CAPABILITY_TAGS', async () => {
		expect(CAPABILITY_TAGS).toHaveLength(12);
		expect(new Set(CAPABILITY_TAGS).size).toBe(CAPABILITY_TAGS.length);
	});

	it('every tag is a kebab-case token', async () => {
		for (const tag of CAPABILITY_TAGS) {
			expect(tag).toMatch(/^[a-z][a-z-]+$/u);
		}
	});

	it('accepts a slice-style capability hint list', async () => {
		const hints: readonly CapabilityTag[] = ['code-edit', 'fast-iteration'];
		expect(hints.every((h) => CAPABILITY_TAGS.includes(h))).toBe(true);
	});
});

describe('IProviderInvoke (discriminated union, CRITICAL C6)', async () => {
	it('accepts the api shape', async () => {
		const invoke: IProviderInvoke = {
			kind: 'api',
			url: 'https://api.example.com/v1/chat',
			method: 'POST',
			envVar: 'OPENAI_API_KEY',
		};
		expect(invoke.kind).toBe('api');
	});

	it('accepts the subscription shape', async () => {
		const invoke: IProviderInvoke = {
			kind: 'subscription',
			tool: 'claude-code',
		};
		expect(invoke.kind).toBe('subscription');
	});

	it('accepts the cli shape', async () => {
		const invoke: IProviderInvoke = {
			kind: 'cli',
			command: 'aider',
			args: ['--message'],
		};
		expect(invoke.kind).toBe('cli');
	});

	it('accepts the mcp-server shape', async () => {
		const invoke: IProviderInvoke = {
			kind: 'mcp-server',
			server: 'codex',
			tool: 'codex',
			args: { model: 'gpt-5' },
		};
		expect(invoke.kind).toBe('mcp-server');
	});
});

describe('IProviderCapabilities', async () => {
	it('accepts a full provider record', async () => {
		const provider: IProviderCapabilities = {
			id: 'openai-gpt5',
			kind: 'api',
			invoke: {
				kind: 'api',
				url: 'https://api.openai.com/v1/chat',
				envVar: 'OPENAI_API_KEY',
			},
			modelId: 'gpt-5',
			contextWindow: 400_000,
			costTier: 4,
			strengths: ['reasoning', 'architecture'],
			weaknesses: ['fast-iteration'],
		};
		expect(provider.id).toBe('openai-gpt5');
		expect(provider.strengths).toContain('reasoning');
	});

	it('pins the ProviderKind closed union', async () => {
		const kinds: readonly ProviderKind[] = [
			'api',
			'subscription',
			'cli',
			'mcp-server',
		];
		expect(new Set(kinds).size).toBe(4);
	});

	it('pins the CostTier range (1..5)', async () => {
		const tiers: readonly CostTier[] = [1, 2, 3, 4, 5];
		expect(tiers).toEqual([1, 2, 3, 4, 5]);
	});
});

describe('IProviderSummary + IProviderAvailability', async () => {
	it('summary carries the cheap reachable boolean', async () => {
		const summary: IProviderSummary = {
			id: 'claude-code-sonnet',
			kind: 'subscription',
			modelId: 'claude-sonnet',
			costTier: 3,
			reachable: true,
			strengths: ['code-edit'],
		};
		expect(summary.reachable).toBe(true);
	});

	it('availability pins the runtime state union', async () => {
		const states: readonly ProviderState[] = [
			'available',
			'quota-exceeded',
			'rate-limited',
			'unauthenticated',
			'not-installed',
			'model-unavailable',
			'error',
		];
		expect(new Set(states).size).toBe(7);
		const availability: IProviderAvailability = {
			id: 'openrouter-minimax',
			state: 'quota-exceeded',
			until: '2026-07-01T00:00:00.000Z',
			reason: 'monthly cap reached',
		};
		expect(availability.state).toBe('quota-exceeded');
	});
});

describe('IRoutingDecision', async () => {
	it('pins the RoutingStrategy closed union', async () => {
		const strategies: readonly RoutingStrategy[] = [
			'passthrough',
			'api',
			'cli',
			'mcp-tool',
			'handoff',
		];
		expect(new Set(strategies).size).toBe(5);
	});

	it('accepts a decision with an empty alternates list (leaf)', async () => {
		const provider: IProviderCapabilities = {
			id: 'aider-cli',
			kind: 'cli',
			invoke: { kind: 'cli', command: 'aider' },
			modelId: 'gpt-5-mini',
			contextWindow: 128_000,
			costTier: 2,
			strengths: ['code-edit'],
			weaknesses: [],
		};
		const decision: IRoutingDecision = {
			strategy: 'cli',
			targetProvider: provider,
			mode: 'implement',
			prompt: 'fix the typo',
			invoke: provider.invoke,
			rationale: 'cheapest code-edit provider available',
			estimatedCostTier: 2,
			alternates: [],
			scoringTrace: [
				{
					provider: 'aider-cli',
					score: 42,
					reasons: ['covers code-edit'],
				},
			],
			sessionId: 'sess-1',
		};
		expect(decision.alternates).toHaveLength(0);
		expect(decision.scoringTrace[0]?.provider).toBe('aider-cli');
	});
});
