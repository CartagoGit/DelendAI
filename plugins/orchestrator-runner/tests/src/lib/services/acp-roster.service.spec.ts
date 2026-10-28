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
			'api-google',
		]);
		expect(entries[0]?.invoke).toEqual({ kind: 'acp', agent: 'opencode' });
		// Google is reached through its own family, at its default API.
		expect(entries[2]).toMatchObject({
			modelId: 'gemini-3',
			invoke: {
				kind: 'api',
				url: 'https://generativelanguage.googleapis.com/v1beta',
				envVar: 'GOOGLE_API_KEY',
				family: 'google',
			},
		});
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
});
