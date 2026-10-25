/**
 * public-catalogue-sources.service.ts — a public catalogue read in layers:
 * its sources in order, then the copy cached on this machine, then the
 * dated copy shipped with delendai.
 *
 * One source was one point of failure: a fresh install had nothing, and
 * a source that disappeared left whatever happened to be cached. Each
 * copy now says where and when it came from. A source is asked again only
 * conditionally (ETag, Last-Modified), so an unchanged catalogue costs
 * no download; a source that fails or vanishes leaves the copy in place.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
	CATALOGUE_CACHE_FOLDER,
	CATALOGUE_FETCH_TIMEOUT_MS,
	CATALOGUE_RECHECK_MS,
	DEFAULT_CATALOGUE_SOURCES,
} from '../contracts/constants/public-catalogues.constant';
import type {
	ICatalogueConditionalFetch,
	ICatalogueCopy,
	ICatalogueCopyMeta,
	ICatalogueRead,
	ICatalogueSources,
	IPublicCatalogueKind,
} from '../contracts/interfaces/public-catalogue.interface';
import { writeFileAtomic } from './atomic-write';
import { isRecord } from './is-record';

/**
 * The sources of `kind` in the order they are read: the person's, the
 * project's, then the defaults, each once.
 */
export const catalogueSources = (
	kind: IPublicCatalogueKind,
	configured: readonly (ICatalogueSources | undefined)[],
): readonly string[] => [
	...new Set([
		...configured.flatMap((each) => each?.[kind] ?? []),
		...DEFAULT_CATALOGUE_SOURCES[kind],
	]),
];

/** The user cache folder holding one copy per catalogue. */
export const catalogueCacheDir = (): string =>
	join(homedir(), '.cache', 'delendai', CATALOGUE_CACHE_FOLDER);

export const catalogueCachePath = (
	kind: IPublicCatalogueKind,
	dir: string = catalogueCacheDir(),
): string => join(dir, `${kind}.json`);

const header = (response: Response, name: string): string | undefined =>
	response.headers.get(name) ?? undefined;

/** A GET that sends what the cached copy knows, so an unchanged file is not sent again. */
export const httpConditionalFetch: ICatalogueConditionalFetch = async (
	url,
	init,
) => {
	const headers: Record<string, string> = {};
	if (init.etag !== undefined) headers['If-None-Match'] = init.etag;
	if (init.lastModified !== undefined)
		headers['If-Modified-Since'] = init.lastModified;
	const response = await fetch(url, {
		headers,
		signal: AbortSignal.timeout(init.timeoutMs),
	});
	return {
		status: response.status,
		body: response.ok ? await response.text() : undefined,
		etag: header(response, 'etag'),
		lastModified: header(response, 'last-modified'),
	};
};

/** A copy's provenance, field by field: `null` in place of one is not a copy. */
const isCopyMeta = (value: unknown): value is ICatalogueCopyMeta =>
	isRecord(value) &&
	typeof value.source === 'string' &&
	typeof value.format === 'number' &&
	typeof value.fetchedAt === 'string' &&
	typeof value.checkedAt === 'string' &&
	typeof value.sha256 === 'string';

/**
 * A copy as written; nothing when the file is missing or not a copy. A
 * malformed copy is no copy: read as one, a `null` field threw in the
 * caller and aborted what the catalogue only helps with.
 */
export const readCatalogueCopy = async <T>(
	path: string,
	isData: (data: unknown) => data is T = (data): data is T => isRecord(data),
): Promise<ICatalogueCopy<T> | undefined> => {
	const text = await readFile(path, 'utf8').catch(() => undefined);
	if (text === undefined) return undefined;
	try {
		const parsed: unknown = JSON.parse(text);
		return isRecord(parsed) &&
			isCopyMeta(parsed.meta) &&
			isData(parsed.data)
			? { meta: parsed.meta, data: parsed.data }
			: undefined;
	} catch {
		return undefined;
	}
};

const writeCopy = async <T>(
	path: string,
	copy: ICatalogueCopy<T>,
): Promise<void> => {
	await writeFileAtomic(path, JSON.stringify(copy)).catch(() => undefined);
};

/**
 * The catalogue of `kind`: a copy checked within the recheck window, else
 * the first source that answers (unchanged or fresh), else the cached
 * copy, else the shipped snapshot. Never throws.
 */
export const readPublicCatalogue = async <T>(input: {
	readonly kind: IPublicCatalogueKind;
	readonly sources: readonly string[];
	/** The raw download reduced to what delendai keeps; nothing when it is not this catalogue. */
	readonly compact: (raw: unknown) => T | undefined;
	/** Whether a cached copy's data has the compact shape; a malformed one is not used. */
	readonly isData?: ((data: unknown) => data is T) | undefined;
	/** The compact shape's version: a cached copy of another one is not trusted. */
	readonly format: number;
	readonly snapshot: () => Promise<ICatalogueCopy<T> | undefined>;
	readonly cacheDir?: string | undefined;
	readonly now?: Date | undefined;
	readonly fetch?: ICatalogueConditionalFetch | undefined;
	readonly recheckMs?: number | undefined;
}): Promise<ICatalogueRead<T> | undefined> => {
	const path = catalogueCachePath(input.kind, input.cacheDir);
	const now = input.now ?? new Date();
	const read = await readCatalogueCopy<T>(path, input.isData);
	const cached = read?.meta.format === input.format ? read : undefined;
	if (
		cached !== undefined &&
		now.getTime() - Date.parse(cached.meta.checkedAt) <
			(input.recheckMs ?? CATALOGUE_RECHECK_MS)
	)
		return { ...cached, origin: 'cache' };
	const get = input.fetch ?? httpConditionalFetch;
	for (const source of input.sources) {
		const known = cached?.meta.source === source ? cached.meta : undefined;
		try {
			const answer = await get(source, {
				etag: known?.etag,
				lastModified: known?.lastModified,
				timeoutMs: CATALOGUE_FETCH_TIMEOUT_MS,
			});
			if (answer.status === 304 && cached !== undefined) {
				const checked = {
					...cached,
					meta: { ...cached.meta, checkedAt: now.toISOString() },
				};
				await writeCopy(path, checked);
				return { ...checked, origin: 'unchanged' };
			}
			if (answer.body === undefined) continue;
			const data = input.compact(JSON.parse(answer.body) as unknown);
			if (data === undefined) continue;
			const fresh: ICatalogueCopy<T> = {
				meta: {
					source,
					format: input.format,
					fetchedAt: now.toISOString(),
					checkedAt: now.toISOString(),
					sha256: createHash('sha256')
						.update(answer.body)
						.digest('hex'),
					etag: answer.etag,
					lastModified: answer.lastModified,
				},
				data,
			};
			await writeCopy(path, fresh);
			return { ...fresh, origin: 'source' };
		} catch {
			// The next source, or the copy: a catalogue never stops the caller.
		}
	}
	if (cached !== undefined) return { ...cached, origin: 'cache' };
	const shipped = await input.snapshot().catch(() => undefined);
	return shipped === undefined
		? undefined
		: { ...shipped, origin: 'snapshot' };
};
