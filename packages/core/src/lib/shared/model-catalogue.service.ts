/**
 * model-catalogue.service.ts — the public model catalogue, cached for a
 * day, and the names it gives to a key variable or a model.
 *
 * A pattern can say a variable looks like a credential; only a catalogue
 * can say `DASHSCOPE_API_KEY` is Alibaba's or who serves `qwen3.8-max`.
 * Keeping such a list by hand is the catalogue problem again. models.dev
 * is maintained in public, so a provider nobody here has heard of is named
 * the day it is listed there.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
	MODEL_CATALOGUE_FILE,
	MODEL_CATALOGUE_MAX_AGE_MS,
	MODEL_CATALOGUE_TIMEOUT_MS,
	MODEL_CATALOGUE_URL,
} from '../contracts/constants/model-catalogue.constant';
import type {
	ICatalogueFetch,
	ICatalogueProvider,
	IModelCatalogue,
} from '../contracts/interfaces/account-finding.interface';
import { writeFileAtomic } from './atomic-write';

/** Where the compact catalogue is cached, beside the models seen. */
export const modelCataloguePath = (): string =>
	join(homedir(), '.cache', 'delendai', MODEL_CATALOGUE_FILE);

/** The raw catalogue reduced to what naming needs. */
export const compactCatalogue = (
	raw: unknown,
	now: Date = new Date(),
): IModelCatalogue | undefined => {
	if (raw === null || typeof raw !== 'object') return undefined;
	const providers: ICatalogueProvider[] = [];
	for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
		if (value === null || typeof value !== 'object') continue;
		const entry = value as {
			name?: unknown;
			env?: unknown;
			models?: unknown;
		};
		providers.push({
			id,
			name: typeof entry.name === 'string' ? entry.name : id,
			env: Array.isArray(entry.env)
				? entry.env.filter(
						(name): name is string => typeof name === 'string',
					)
				: [],
			models:
				entry.models !== null && typeof entry.models === 'object'
					? Object.keys(entry.models)
					: [],
		});
	}
	return providers.length === 0
		? undefined
		: { fetchedAt: now.toISOString(), providers };
};

const realFetch: ICatalogueFetch = async (url, timeoutMs) => {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(timeoutMs),
	});
	return response.ok ? ((await response.json()) as unknown) : undefined;
};

/**
 * The catalogue: the cached copy while it is younger than a day, else a
 * fresh one (cached), else the stale copy, else nothing. Never throws.
 */
export const readModelCatalogue = async (
	input: {
		readonly path?: string | undefined;
		readonly now?: Date | undefined;
		readonly fetchCatalogue?: ICatalogueFetch | undefined;
	} = {},
): Promise<IModelCatalogue | undefined> => {
	const path = input.path ?? modelCataloguePath();
	const now = input.now ?? new Date();
	const cached = await readFile(path, 'utf8')
		.then((text) => JSON.parse(text) as IModelCatalogue)
		.catch(() => undefined);
	const age =
		cached === undefined
			? Number.POSITIVE_INFINITY
			: now.getTime() - Date.parse(cached.fetchedAt);
	if (cached !== undefined && age < MODEL_CATALOGUE_MAX_AGE_MS) return cached;
	try {
		const fresh = compactCatalogue(
			await (input.fetchCatalogue ?? realFetch)(
				MODEL_CATALOGUE_URL,
				MODEL_CATALOGUE_TIMEOUT_MS,
			),
			now,
		);
		if (fresh === undefined) return cached;
		await writeFileAtomic(path, JSON.stringify(fresh)).catch(
			() => undefined,
		);
		return fresh;
	} catch {
		return cached;
	}
};

/** Providers whose id is `stem`, then those whose id starts with it, then the rest. */
const closestTo = (
	providers: readonly ICatalogueProvider[],
	stem: string,
): ICatalogueProvider | undefined =>
	providers.find((provider) => provider.id === stem) ??
	providers.find((provider) => provider.id.startsWith(stem)) ??
	providers[0];

/**
 * The provider whose key `variable` holds. Several list the same variable
 * (every MiniMax region reads `MINIMAX_API_KEY`), so the one named like
 * the variable wins.
 */
export const providerOfVariable = (
	catalogue: IModelCatalogue | undefined,
	variable: string,
): ICatalogueProvider | undefined =>
	closestTo(
		catalogue?.providers.filter((provider) =>
			provider.env.includes(variable),
		) ?? [],
		(variable.split('_')[0] ?? variable).toLowerCase(),
	);

const lastSegment = (id: string): string =>
	(id.split('/').pop() ?? id).toLowerCase();

/** The `maker/` prefixes aggregators list `matches` under, most agreed first. */
const aggregatorMakers = (
	catalogue: IModelCatalogue,
	matches: (model: string) => boolean,
): readonly string[] => {
	const tally = new Map<string, number>();
	for (const id of catalogue.providers.flatMap((p) => p.models)) {
		const [maker] = id.split('/');
		if (
			maker === undefined ||
			!id.includes('/') ||
			!matches(lastSegment(id))
		)
			continue;
		tally.set(maker, (tally.get(maker) ?? 0) + 1);
	}
	return [...tally].sort((a, b) => b[1] - a[1]).map(([maker]) => maker);
};

const letters = (id: string): string =>
	id.toLowerCase().replace(/[^a-z0-9]/gu, '');

/** The provider a maker prefix names: `z-ai` and `zai-org` are `zai`. */
const providerNamed = (
	catalogue: IModelCatalogue,
	maker: string,
): ICatalogueProvider | undefined =>
	catalogue.providers.find((provider) => provider.id === maker) ??
	catalogue.providers.find(
		(provider) =>
			letters(provider.id) === letters(maker) ||
			letters(maker).startsWith(letters(provider.id)),
	);

/** The provider listing most bare `family…` models: a maker sells its whole family. */
const widestSeller = (
	catalogue: IModelCatalogue,
	family: string,
): ICatalogueProvider | undefined => {
	const count = (provider: ICatalogueProvider): number =>
		provider.models.filter(
			(id) => !id.includes('/') && id.toLowerCase().startsWith(family),
		).length;
	const best = [...catalogue.providers].sort(
		(a, b) => count(b) - count(a),
	)[0];
	return best === undefined || count(best) === 0 ? undefined : best;
};

/**
 * Who makes `model`. Resellers list a model under its bare name, so a
 * bare listing says who sells it, not who made it; aggregators file it
 * under `maker/model`, and the makers most of them agree on are tried
 * first. A model the catalogue does not list yet is matched by its family
 * (`gemini-…` is filed under google). A maker no provider is named after
 * is named by its prefix alone; with no aggregator at all, the provider
 * selling most of the family. `undefined` when nothing names one.
 */
export const providerOfModel = (
	catalogue: IModelCatalogue | undefined,
	model: string,
): ICatalogueProvider | undefined => {
	if (catalogue === undefined) return undefined;
	const wanted = lastSegment(model);
	const family = /^[a-z]+/u.exec(wanted)?.[0] ?? wanted;
	const makers = [
		...aggregatorMakers(catalogue, (id) => id === wanted),
		family,
		...aggregatorMakers(catalogue, (id) => id.startsWith(family)),
	];
	for (const maker of makers) {
		const named = providerNamed(catalogue, maker);
		if (named !== undefined) return named;
	}
	const top = makers.find((maker) => maker !== family);
	return top === undefined
		? widestSeller(catalogue, family)
		: { id: top, name: top, env: [], models: [] };
};
