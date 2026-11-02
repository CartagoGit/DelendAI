/**
 * declared-providers.helper.spec.ts — a provider declared in models.dev's
 * shape replaces the catalogue's entry of the same id, and is accepted by
 * the project's configuration.
 */
import { describe, expect, it } from 'vitest';

import { DECLARED_PROVIDER_SCHEMA } from '../../../../src/lib/contracts/constants/declared-provider-schema.constant';
import { withDeclaredProviders } from '../../../../src/lib/shared/declared-providers.helper';

const catalogue = {
	fetchedAt: '2026-10-01T00:00:00.000Z',
	providers: [
		{ id: 'zai', name: 'Z.AI', env: ['ZAI_API_KEY'], models: ['glm-5'] },
		{ id: 'other', name: 'Other', env: [], models: [] },
	],
};

describe('withDeclaredProviders', () => {
	it('replaces the entry of the same id, adds a new one, and keeps the rest', () => {
		const merged = withDeclaredProviders(catalogue, [
			{
				id: 'zai',
				name: 'Z.AI (our proxy)',
				npm: '@ai-sdk/openai-compatible',
				api: 'https://proxy.example.test/v4',
				env: ['OUR_ZAI_KEY'],
				models: { 'glm-5.3': {}, 'glm-5': {} },
			},
			{ id: 'mine', name: 'Mine', env: ['MINE_KEY'], models: ['m1'] },
		]);
		expect(merged?.providers).toEqual([
			{
				id: 'zai',
				name: 'Z.AI (our proxy)',
				env: ['OUR_ZAI_KEY'],
				models: ['glm-5.3', 'glm-5'],
				api: 'https://proxy.example.test/v4',
				npm: '@ai-sdk/openai-compatible',
			},
			{ id: 'other', name: 'Other', env: [], models: [] },
			{ id: 'mine', name: 'Mine', env: ['MINE_KEY'], models: ['m1'] },
		]);
		expect(merged?.fetchedAt).toBe(catalogue.fetchedAt);
	});

	it('lets a later declaration of an id win, and stands alone without a catalogue', () => {
		const merged = withDeclaredProviders(undefined, [
			{ id: 'a', name: 'Project', env: [], models: [] },
			{ id: 'a', name: 'Person', env: [], models: [] },
		]);
		expect(merged?.providers.map((p) => p.name)).toEqual(['Person']);
		expect(withDeclaredProviders(catalogue, [])).toBe(catalogue);
	});
});

describe('DECLARED_PROVIDER_SCHEMA', () => {
	it("accepts models.dev's own entry shape and refuses an unknown field", () => {
		expect(
			DECLARED_PROVIDER_SCHEMA.safeParse({
				id: 'zai',
				name: 'Z.AI',
				npm: '@ai-sdk/openai-compatible',
				api: 'https://api.z.ai/api/paas/v4',
				env: ['ZHIPU_API_KEY'],
				models: { 'glm-5': { id: 'glm-5' } },
			}).success,
		).toBe(true);
		expect(
			DECLARED_PROVIDER_SCHEMA.safeParse({
				id: 'zai',
				name: 'Z.AI',
				env: [],
				models: [],
				kind: 'api',
			}).success,
		).toBe(false);
	});
});
