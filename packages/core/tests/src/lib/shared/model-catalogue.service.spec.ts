/**
 * model-catalogue.service.spec.ts — the public catalogue, cached a day,
 * and the names it gives: a key variable's provider, a model's maker.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODEL_CATALOGUE_FORMAT } from '../../../../src/lib/contracts/constants/public-catalogues.constant';
import type { IModelCatalogue } from '../../../../src/lib/contracts/interfaces/account-finding.interface';
import {
	compactCatalogue,
	shippedModelCatalogue,
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
	const dirs = () => {
		const root = mkdtempSync(join(tmpdir(), 'catalogue-'));
		return {
			cacheDir: join(root, 'catalogues'),
			legacyPath: join(root, 'model-catalogue.json'),
		};
	};
	const answering = (status: number, body?: unknown) => async () => ({
		status,
		body: body === undefined ? undefined : JSON.stringify(body),
		etag: '"v1"',
	});

	it('reads a source, keeps the copy, and names its provider fields', async () => {
		const at = dirs();
		const read = await readModelCatalogue({
			...at,
			now: NOW,
			sources: ['https://example.test/models.json'],
			fetch: answering(200, RAW),
		});
		expect(read?.providers.find((p) => p.id === 'alibaba')?.name).toBe(
			'Alibaba',
		);
		const kept = JSON.parse(
			readFileSync(join(at.cacheDir, 'models.json'), 'utf8'),
		);
		expect(kept.meta).toMatchObject({
			source: 'https://example.test/models.json',
			format: MODEL_CATALOGUE_FORMAT,
			etag: '"v1"',
		});
		expect(kept.meta.sha256).toMatch(/^[0-9a-f]{64}$/u);
	});

	it('moves the copy the first offer cached into the layers, once, and journals it', async () => {
		const at = dirs();
		writeFileSync(at.legacyPath, JSON.stringify(catalogue));
		const read = await readModelCatalogue({
			...at,
			now: NOW,
			sources: [],
			snapshot: async () => undefined,
		});
		expect(read?.fetchedAt).toBe(NOW.toISOString());
		expect(existsSync(at.legacyPath)).toBe(false);
		expect(
			readFileSync(join(at.cacheDir, 'journal.jsonl'), 'utf8'),
		).toContain('model-catalogue.json');
	});

	it('falls back to the shipped snapshot, which is dated and names providers', async () => {
		const shipped = await shippedModelCatalogue();
		expect(shipped?.meta.source).toBe('https://models.dev/api.json');
		expect(Date.parse(shipped?.meta.fetchedAt ?? '')).toBeGreaterThan(0);
		expect(shipped?.data.providers.length).toBeGreaterThan(100);
		const read = await readModelCatalogue({
			...dirs(),
			now: NOW,
			sources: ['https://example.test/gone.json'],
			fetch: async () => {
				throw new Error('offline');
			},
		});
		expect(read?.providers.length).toBe(shipped?.data.providers.length);
	});
});
