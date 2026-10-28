/**
 * acp-roster.service.spec.ts — roster entries proposed from agents that
 * can start here and catalogue providers whose key is set.
 */
import { describe, expect, it } from 'vitest';

import type { IModelCatalogue } from '@delendai/core/contracts';

import { proposedRosterEntries } from '../../../../src/lib/services/acp-roster.service';

const CATALOGUE: IModelCatalogue = {
	fetchedAt: '',
	providers: [
		{
			id: 'zai',
			name: 'Z.AI',
			env: ['ZAI_API_KEY'],
			models: ['zai/glm-5'],
			api: 'https://api.z.test/v4',
			npm: '@ai-sdk/openai-compatible',
		},
		{
			id: 'google',
			name: 'Google',
			env: ['GOOGLE_API_KEY'],
			models: ['gemini-3'],
			npm: '@ai-sdk/google',
		},
		{
			id: 'nokey',
			name: 'No Key',
			env: ['NOKEY_API_KEY'],
			models: ['m'],
			npm: '@ai-sdk/openai-compatible',
		},
	],
};

describe('proposedRosterEntries', () => {
	const priced = (costs: Record<string, [number, number]>) => ({
		fetchedAt: '2026-10-28T00:00:00.000Z',
		providers: [
			{
				id: 'minimax',
				name: 'MiniMax',
				env: ['MINIMAX_API_KEY'],
				models: ['MiniMax-M2.1', 'MiniMax-M3', 'MiniMax-M3.1-Flash'],
				costs,
				api: 'https://api.minimax.test/anthropic/v1',
				npm: '@ai-sdk/anthropic',
			},
		],
	});
	const minimax = (
		costs: Record<string, [number, number]>,
		clientModels?: { provider: string; models: string[] }[],
	) =>
		proposedRosterEntries({
			agents: [],
			catalogue: priced(costs),
			env: { MINIMAX_API_KEY: 'k' },
			existing: [],
			...(clientModels === undefined ? {} : { clientModels }),
		})[0];

	it("proposes the model the provider's own client lists, not the catalogue's first", () => {
		expect(
			minimax({}, [
				{
					provider: 'minimax',
					models: ['MiniMax-M3', 'MiniMax-M3.1-Flash'],
				},
			])?.modelId,
		).toBe('MiniMax-M3');
		expect(minimax({})?.modelId).toBe('MiniMax-M2.1');
	});

	it('tiers a proposal by the price of its model, a free one lowest', () => {
		const listed = [{ provider: 'minimax', models: ['MiniMax-M3'] }];
		expect(minimax({ 'MiniMax-M3': [0, 0] }, listed)?.costTier).toBe(1);
		expect(minimax({ 'MiniMax-M3': [0.3, 1.2] }, listed)?.costTier).toBe(3);
		expect(minimax({ 'MiniMax-M3': [15, 75] }, listed)?.costTier).toBe(5);
		expect(minimax({}, listed)?.costTier).toBe(3);
	});

	it('proposes an acp entry per agent that can start, and an api entry per reachable provider', () => {
		const entries = proposedRosterEntries({
			agents: [
				{ id: 'opencode', canStart: true },
				{ id: 'cursor', canStart: false },
			],
			catalogue: CATALOGUE,
			env: { ZAI_API_KEY: 'k', GOOGLE_API_KEY: 'k' },
			existing: [],
		});
		expect(entries.map((entry) => entry.id)).toEqual([
			'acp-opencode',
			'api-zai',
		]);
		expect(entries[0]?.invoke).toEqual({ kind: 'acp', agent: 'opencode' });
		expect(entries[1]).toMatchObject({
			kind: 'api',
			modelId: 'glm-5',
			invoke: {
				kind: 'api',
				url: 'https://api.z.test/v4',
				envVar: 'ZAI_API_KEY',
				family: 'openai',
			},
		});
	});

	it('leaves out what the roster already has, and works without a catalogue', () => {
		const existing = proposedRosterEntries({
			agents: [{ id: 'opencode', canStart: true }],
			env: {},
			existing: [],
		});
		expect(
			proposedRosterEntries({
				agents: [{ id: 'opencode', canStart: true }],
				env: {},
				existing,
			}),
		).toEqual([]);
	});

	it('proposes each model the host serves on the person key, run through the host', () => {
		const entries = proposedRosterEntries({
			agents: [],
			env: {},
			existing: [],
			hostByok: [
				{
					host: '/editor/User',
					profile: 'p1',
					name: 'Coding Plan',
					vendor: 'customendpoint',
					models: [
						{
							id: 'glm-5.3',
							toolCalling: true,
							contextWindow: 1_000_000,
						},
						{ id: 'glm-5.3-flash' },
					],
				},
			],
		});
		expect(entries).toEqual([
			expect.objectContaining({
				id: 'byok-customendpoint-glm-5-3',
				kind: 'host-sampling',
				invoke: { kind: 'host-sampling', model: 'glm-5.3' },
				contextWindow: 1_000_000,
				strengths: ['code-edit', 'agentic'],
			}),
			expect.objectContaining({
				id: 'byok-customendpoint-glm-5-3-flash',
				strengths: ['code-edit'],
			}),
		]);
	});
});
