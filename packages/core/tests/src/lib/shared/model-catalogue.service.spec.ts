/**
 * model-catalogue.service.spec.ts — the public catalogue, cached a day,
 * and the names it gives: a key variable's provider, a model's maker.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IModelCatalogue } from '../../../../src/lib/contracts/interfaces/account-finding.interface';
import {
	compactCatalogue,
	modelCataloguePath,
	providerOfModel,
	providerOfVariable,
	readModelCatalogue,
} from '../../../../src/lib/shared/model-catalogue.service';

/** The shape models.dev serves, cut down to what the names need. */
const RAW = {
	minimax: {
		name: 'MiniMax',
		env: ['MINIMAX_API_KEY'],
		models: { 'MiniMax-M3': {} },
	},
	'minimax-cn': {
		name: 'MiniMax (China)',
		env: ['MINIMAX_API_KEY'],
		models: {},
	},
	alibaba: {
		name: 'Alibaba',
		env: ['DASHSCOPE_API_KEY'],
		models: { 'qwen3-max': {}, 'qwen3-flash': {} },
	},
	zai: { name: 'Z.AI', env: ['ZHIPU_API_KEY'], models: { 'glm-5': {} } },
	reseller: {
		name: 'Reseller',
		env: [],
		models: { 'glm-5': {}, 'gpt-6': {} },
	},
	router: {
		name: 'Router',
		env: ['ROUTER_KEY'],
		models: {
			'z-ai/glm-5': {},
			'zai-org/glm-5': {},
			'openai/gpt-6': {},
			'microsoft/phi-5': {},
			'qwen/qwen3-max': {},
		},
	},
	openai: {
		name: 'OpenAI',
		env: ['OPENAI_API_KEY'],
		models: { 'gpt-6': {} },
	},
	broken: 'not an object',
};

const NOW = new Date('2026-10-21T12:00:00Z');
const catalogue = compactCatalogue(RAW, NOW) as IModelCatalogue;

describe('compactCatalogue', () => {
	it('keeps each provider with its name, key variables and model ids', () => {
		expect(catalogue.fetchedAt).toBe(NOW.toISOString());
		expect(catalogue.providers.find((p) => p.id === 'alibaba')).toEqual({
			id: 'alibaba',
			name: 'Alibaba',
			env: ['DASHSCOPE_API_KEY'],
			models: ['qwen3-max', 'qwen3-flash'],
		});
		expect(catalogue.providers.some((p) => p.id === 'broken')).toBe(false);
	});

	it('names a provider by its id when the catalogue gives no name', () => {
		const bare = compactCatalogue({ x: { env: 'no', models: null } }, NOW);
		expect(bare?.providers).toEqual([
			{ id: 'x', name: 'x', env: [], models: [] },
		]);
	});

	it('is nothing for an answer that is not a catalogue', () => {
		expect(compactCatalogue(null)).toBeUndefined();
		expect(compactCatalogue({})).toBeUndefined();
	});
});

describe('providerOfVariable', () => {
	it('names the provider called like the variable among those sharing it', () => {
		expect(providerOfVariable(catalogue, 'MINIMAX_API_KEY')?.name).toBe(
			'MiniMax',
		);
	});

	it('names a provider whatever the variable is called', () => {
		expect(providerOfVariable(catalogue, 'DASHSCOPE_API_KEY')?.id).toBe(
			'alibaba',
		);
	});

	it('is nothing for an unlisted variable or without a catalogue', () => {
		expect(providerOfVariable(catalogue, 'HOME_KEY')).toBeUndefined();
		expect(providerOfVariable(undefined, 'OPENAI_API_KEY')).toBeUndefined();
	});
});

describe('providerOfModel', () => {
	it('names the maker aggregators agree on, not a reseller', () => {
		expect(providerOfModel(catalogue, 'glm-5')?.name).toBe('Z.AI');
		expect(providerOfModel(catalogue, 'gpt-6')?.name).toBe('OpenAI');
	});

	it('tries the next maker when the first names no provider', () => {
		expect(providerOfModel(catalogue, 'qwen3-max')?.name).toBe('Alibaba');
	});

	it('matches a model not listed yet by its family', () => {
		expect(providerOfModel(catalogue, 'glm-5.3-flash')?.name).toBe('Z.AI');
		expect(providerOfModel(catalogue, 'minimax-m9')?.id).toBe('minimax');
	});

	it('names a maker no provider is called after by its prefix', () => {
		expect(providerOfModel(catalogue, 'phi-5')).toEqual({
			id: 'microsoft',
			name: 'microsoft',
			env: [],
			models: [],
		});
	});

	it('falls back to the widest seller of the family', () => {
		const sellers = compactCatalogue(
			{
				a: { name: 'A', env: [], models: { 'mimo-1': {} } },
				b: {
					name: 'B',
					env: [],
					models: { 'mimo-1': {}, 'mimo-2': {} },
				},
			},
			NOW,
		);
		expect(providerOfModel(sellers, 'mimo-3')?.name).toBe('B');
	});

	it('is nothing for a model nobody lists, or without a catalogue', () => {
		expect(providerOfModel(catalogue, 'unheard-of-1')).toBeUndefined();
		expect(providerOfModel(undefined, 'gpt-6')).toBeUndefined();
	});
});

describe('readModelCatalogue', () => {
	const temp = (): string =>
		join(mkdtempSync(join(tmpdir(), 'catalogue-')), 'model-catalogue.json');

	it('is cached under the delendai cache directory', () => {
		expect(modelCataloguePath()).toMatch(
			/delendai[/\\]model-catalogue\.json$/u,
		);
	});

	it('fetches, caches, and serves the cache for a day', async () => {
		const path = temp();
		let fetches = 0;
		const fetchCatalogue = async (): Promise<unknown> => {
			fetches += 1;
			return RAW;
		};
		const first = await readModelCatalogue({
			path,
			now: NOW,
			fetchCatalogue,
		});
		expect(first?.providers.length).toBe(catalogue.providers.length);
		expect(JSON.parse(readFileSync(path, 'utf8')).fetchedAt).toBe(
			NOW.toISOString(),
		);
		const later = new Date(NOW.getTime() + 60 * 60 * 1000);
		await readModelCatalogue({ path, now: later, fetchCatalogue });
		expect(fetches).toBe(1);
	});

	it('serves the stale copy when a fresh one cannot be had', async () => {
		const path = temp();
		writeFileSync(path, JSON.stringify(catalogue));
		const nextWeek = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
		const failing = await readModelCatalogue({
			path,
			now: nextWeek,
			fetchCatalogue: async () => {
				throw new Error('offline');
			},
		});
		expect(failing?.fetchedAt).toBe(NOW.toISOString());
		const empty = await readModelCatalogue({
			path,
			now: nextWeek,
			fetchCatalogue: async () => undefined,
		});
		expect(empty?.fetchedAt).toBe(NOW.toISOString());
	});

	it('is nothing with neither a cache nor a network', async () => {
		expect(
			await readModelCatalogue({
				path: temp(),
				now: NOW,
				fetchCatalogue: async () => {
					throw new Error('offline');
				},
			}),
		).toBeUndefined();
	});
});
