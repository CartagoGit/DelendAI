import { describe, expect, it } from 'vitest';

import {
	createRgBackend,
	defaultRgAvailableProbe,
	RG_BACKEND_ID,
} from '@mcp-vertex/search/lib/services/search-engine.backends';
import {
	createInHouseBackend,
	IN_HOUSE_BACKEND_ID,
} from '@mcp-vertex/search/lib/services/search-engine.in-house';
import {
	createSearchDispatcher,
	searchWorkspace,
} from '@mcp-vertex/search/lib/services/search-engine.service';
import type {
	ISearchBackend,
	ISearchResult,
} from '@mcp-vertex/search/lib/services/search-engine.types';

const stubBackend = (
	id: string,
	outcome: ISearchResult,
	options: { available?: boolean; throws?: boolean } = {},
): ISearchBackend => ({
	id,
	isAvailable: async () => options.available ?? true,
	execute: async () => {
		if (options.throws) throw new Error(`${id} blew up`);
		return outcome;
	},
});

describe('search-engine dispatcher (Solid Strategy)', () => {
	describe('backend identities (stable contracts)', () => {
		it('RG_BACKEND_ID is "rg"', () => {
			expect(RG_BACKEND_ID).toBe('rg');
		});
		it('IN_HOUSE_BACKEND_ID is "in-house"', () => {
			expect(IN_HOUSE_BACKEND_ID).toBe('in-house');
		});
	});

	describe('createRgBackend (Solid-OCP)', () => {
		it('reports its id as "rg" and exposes the available probe', async () => {
			const backend = createRgBackend({
				rgAvailable: async () => true,
			});
			expect(backend.id).toBe('rg');
			expect(await backend.isAvailable()).toBe(true);
		});

		it('accepts a custom rgAvailable probe', async () => {
			const probe = async () => false;
			const backend = createRgBackend({ rgAvailable: probe });
			expect(await backend.isAvailable()).toBe(false);
		});

		it('defaults to the real subprocess probe (no crash)', async () => {
			// We do NOT assert the result — rg may or may not be
			// installed. We only assert the probe is callable and
			// returns a boolean.
			const available = await defaultRgAvailableProbe();
			expect(typeof available).toBe('boolean');
		});
	});

	describe('createInHouseBackend (Solid-OCP)', () => {
		it('reports its id as "in-house" and is always available', async () => {
			const backend = createInHouseBackend();
			expect(backend.id).toBe('in-house');
			expect(await backend.isAvailable()).toBe(true);
		});
	});

	describe('createSearchDispatcher (Solid-LSP)', () => {
		it('throws when given an empty backend list', () => {
			expect(() => createSearchDispatcher([])).toThrow(
				/at least one backend/,
			);
		});

		it('uses the first available backend', async () => {
			const first = stubBackend('a', {
				query: 'q',
				hits: [{ file: 'x.ts', line: 1, text: 'q' }],
				truncated: false,
				scanned: 1,
				usedRg: false,
			});
			const second = stubBackend('b', {
				query: 'q',
				hits: [],
				truncated: false,
				scanned: 0,
				usedRg: false,
			});
			const dispatcher = createSearchDispatcher([first, second]);
			const res = await dispatcher({
				workspaceRootAbs: '/x',
				query: 'q',
				options: {},
			});
			expect(res.scanned).toBe(1);
		});

		it('skips unavailable backends and falls back to the next', async () => {
			const unavailable = stubBackend(
				'unavail',
				{
					query: 'q',
					hits: [],
					truncated: false,
					scanned: 0,
					usedRg: false,
				},
				{ available: false },
			);
			const fallback = stubBackend('fallback', {
				query: 'q',
				hits: [{ file: 'y.ts', line: 2, text: 'q' }],
				truncated: false,
				scanned: 5,
				usedRg: false,
			});
			const dispatcher = createSearchDispatcher([unavailable, fallback]);
			const res = await dispatcher({
				workspaceRootAbs: '/x',
				query: 'q',
				options: {},
			});
			expect(res.hits[0]?.file).toBe('y.ts');
			expect(res.scanned).toBe(5);
		});

		it('returns an empty envelope when no backend is available', async () => {
			const a = stubBackend(
				'a',
				{
					query: 'q',
					hits: [],
					truncated: false,
					scanned: 0,
					usedRg: false,
				},
				{ available: false },
			);
			const b = stubBackend(
				'b',
				{
					query: 'q',
					hits: [],
					truncated: false,
					scanned: 0,
					usedRg: false,
				},
				{ available: false },
			);
			const dispatcher = createSearchDispatcher([a, b]);
			const res = await dispatcher({
				workspaceRootAbs: '/x',
				query: 'q',
				options: {},
			});
			expect(res.hits).toEqual([]);
			expect(res.usedRg).toBe(false);
		});

		it('falls back to the next backend when the first throws', async () => {
			const failing = stubBackend(
				'failing',
				{
					query: 'q',
					hits: [],
					truncated: false,
					scanned: 0,
					usedRg: false,
				},
				{ throws: true },
			);
			const ok = stubBackend('ok', {
				query: 'q',
				hits: [{ file: 'z.ts', line: 1, text: 'q' }],
				truncated: false,
				scanned: 3,
				usedRg: false,
			});
			const dispatcher = createSearchDispatcher([failing, ok]);
			const res = await dispatcher({
				workspaceRootAbs: '/x',
				query: 'q',
				options: {},
			});
			expect(res.hits[0]?.file).toBe('z.ts');
		});

		it('throws when every backend fails (last error wins)', async () => {
			const a = stubBackend(
				'a',
				{
					query: 'q',
					hits: [],
					truncated: false,
					scanned: 0,
					usedRg: false,
				},
				{ throws: true },
			);
			const b = stubBackend(
				'b',
				{
					query: 'q',
					hits: [],
					truncated: false,
					scanned: 0,
					usedRg: false,
				},
				{ throws: true },
			);
			const dispatcher = createSearchDispatcher([a, b]);
			await expect(
				dispatcher({ workspaceRootAbs: '/x', query: 'q', options: {} }),
			).rejects.toThrow(/b blew up/);
		});

		it('honours LSP: any ISearchBackend works without casting', async () => {
			// Custom shape that still satisfies ISearchBackend — proves
			// the dispatcher never reads more than the interface.
			const custom: ISearchBackend = {
				id: 'custom',
				isAvailable: async () => true,
				execute: async () => ({
					query: 'q',
					hits: [{ file: 'c.ts', line: 1, text: 'q' }],
					truncated: false,
					scanned: 99,
					usedRg: false,
				}),
			};
			const dispatcher = createSearchDispatcher([custom]);
			const res = await dispatcher({
				workspaceRootAbs: '/x',
				query: 'q',
				options: {},
			});
			expect(res.scanned).toBe(99);
		});
	});

	describe('searchWorkspace (legacy contract)', () => {
		it('returns an empty envelope for empty queries', async () => {
			const res = await searchWorkspace('/x', '   ', {});
			expect(res.hits).toEqual([]);
			expect(res.usedRg).toBe(false);
		});
	});
});
