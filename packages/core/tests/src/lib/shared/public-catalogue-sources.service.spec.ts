/**
 * public-catalogue-sources.service.spec.ts — a catalogue read in layers:
 * sources in order, asked only whether they changed; then the cached
 * copy; then the shipped snapshot.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type {
	ICatalogueConditionalFetch,
	ICatalogueCopy,
} from '../../../../src/lib/contracts/interfaces/public-catalogue.interface';
import {
	catalogueCachePath,
	catalogueSources,
	readCatalogueCopy,
	readPublicCatalogue,
} from '../../../../src/lib/shared/public-catalogue-sources.service';

type IList = { readonly items: readonly string[] };

const NOW = new Date('2026-10-21T12:00:00Z');
const LATER = new Date('2026-10-21T13:00:00Z');
const compact = (raw: unknown): IList | undefined =>
	raw !== null && typeof raw === 'object' && 'items' in raw
		? { items: (raw as { items: string[] }).items }
		: undefined;

const recording = (
	answers: Record<string, { status: number; body?: unknown; etag?: string }>,
) => {
	const asked: { url: string; etag?: string | undefined }[] = [];
	const fetch: ICatalogueConditionalFetch = async (url, init) => {
		asked.push({ url, etag: init.etag });
		const answer = answers[url];
		if (answer === undefined) throw new Error('offline');
		return {
			status: answer.status,
			body:
				answer.body === undefined
					? undefined
					: JSON.stringify(answer.body),
			etag: answer.etag,
		};
	};
	return { asked, fetch };
};

const read = (
	cacheDir: string,
	fetch: ICatalogueConditionalFetch,
	sources: readonly string[],
	now = NOW,
	snapshot: ICatalogueCopy<IList> | undefined = undefined,
) =>
	readPublicCatalogue({
		kind: 'agents',
		sources,
		compact,
		format: 1,
		snapshot: async () => snapshot,
		cacheDir,
		now,
		fetch,
	});

describe('readPublicCatalogue', () => {
	it('takes the first source that answers with a catalogue', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'layers-'));
		const { asked, fetch } = recording({
			'https://a.test': { status: 500 },
			'https://b.test': { status: 200, body: { nope: 1 } },
			'https://c.test': {
				status: 200,
				body: { items: ['x'] },
				etag: '"1"',
			},
		});
		const got = await read(dir, fetch, [
			'https://gone.test',
			'https://a.test',
			'https://b.test',
			'https://c.test',
		]);
		expect(got?.origin).toBe('source');
		expect(got?.data.items).toEqual(['x']);
		expect(got?.meta).toMatchObject({
			source: 'https://c.test',
			etag: '"1"',
		});
		expect(asked.map((each) => each.url)).toHaveLength(4);
	});

	it('asks again within the recheck window once the configured sources change', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'layers-'));
		const first = recording({
			'https://c.test': { status: 200, body: { items: ['old'] } },
		});
		await read(dir, first.fetch, ['https://c.test']);
		const mine = recording({
			'https://mine.test': { status: 200, body: { items: ['mine'] } },
		});
		const got = await read(dir, mine.fetch, [
			'https://mine.test',
			'https://c.test',
		]);
		expect(got?.origin).toBe('source');
		expect(got?.data.items).toEqual(['mine']);
		const soon = recording({});
		expect(
			(
				await read(dir, soon.fetch, [
					'https://mine.test',
					'https://c.test',
				])
			)?.origin,
		).toBe('cache');
		expect(soon.asked).toEqual([]);
	});

	it('serves the copy without asking within the recheck window, then asks with its ETag', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'layers-'));
		const first = recording({
			'https://c.test': {
				status: 200,
				body: { items: ['x'] },
				etag: '"1"',
			},
		});
		await read(dir, first.fetch, ['https://c.test']);
		const soon = recording({});
		expect((await read(dir, soon.fetch, ['https://c.test']))?.origin).toBe(
			'cache',
		);
		expect(soon.asked).toEqual([]);
		const later = recording({ 'https://c.test': { status: 304 } });
		const unchanged = await read(
			dir,
			later.fetch,
			['https://c.test'],
			LATER,
		);
		expect(unchanged?.origin).toBe('unchanged');
		expect(later.asked).toEqual([{ url: 'https://c.test', etag: '"1"' }]);
		expect(
			(await readCatalogueCopy<IList>(catalogueCachePath('agents', dir)))
				?.meta.checkedAt,
		).toBe(LATER.toISOString());
	});

	it('keeps the copy when every source fails, and falls back to the snapshot without one', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'layers-'));
		const ok = recording({
			'https://c.test': { status: 200, body: { items: ['x'] } },
		});
		await read(dir, ok.fetch, ['https://c.test']);
		const offline = recording({});
		expect(
			(await read(dir, offline.fetch, ['https://c.test'], LATER))?.origin,
		).toBe('cache');
		const shipped: ICatalogueCopy<IList> = {
			meta: {
				source: 'https://c.test',
				format: 1,
				fetchedAt: NOW.toISOString(),
				checkedAt: NOW.toISOString(),
				sha256: '',
			},
			data: { items: ['shipped'] },
		};
		const empty = mkdtempSync(join(tmpdir(), 'layers-'));
		const got = await read(
			empty,
			offline.fetch,
			['https://c.test'],
			NOW,
			shipped,
		);
		expect(got?.origin).toBe('snapshot');
		expect(got?.data.items).toEqual(['shipped']);
		expect(await read(empty, offline.fetch, [], NOW)).toBeUndefined();
	});

	it('does not trust a copy of another format, nor a file that is not a copy', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'layers-'));
		mkdirSync(dir, { recursive: true });
		const path = catalogueCachePath('agents', dir);
		writeFileSync(
			path,
			JSON.stringify({
				meta: {
					source: 'https://c.test',
					format: 0,
					fetchedAt: '',
					checkedAt: NOW.toISOString(),
					sha256: '',
					etag: '"old"',
				},
				data: { items: ['old'] },
			}),
		);
		const fresh = recording({
			'https://c.test': { status: 200, body: { items: ['new'] } },
		});
		const got = await read(dir, fresh.fetch, ['https://c.test']);
		expect(got?.data.items).toEqual(['new']);
		expect(fresh.asked[0]?.etag).toBeUndefined();
		writeFileSync(path, 'not json');
		expect(await readCatalogueCopy(path)).toBeUndefined();
		writeFileSync(path, '{"meta": {}}');
		expect(await readCatalogueCopy(path)).toBeUndefined();
	});
});

describe('catalogueSources', () => {
	it('reads the configured sources first, then the defaults, each once', () => {
		const sources = catalogueSources('models', [
			{ models: ['https://mine.test/models.json'] },
			undefined,
			{
				models: [
					'https://models.dev/api.json',
					'https://team.test/m.json',
				],
				agents: ['https://x.test'],
			},
		]);
		expect(sources).toEqual([
			'https://mine.test/models.json',
			'https://models.dev/api.json',
			'https://team.test/m.json',
		]);
		expect(catalogueSources('agents', [])).toEqual([
			'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json',
		]);
	});
});
