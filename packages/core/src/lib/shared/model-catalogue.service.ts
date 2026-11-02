/**
 * model-catalogue.service.ts — the public model catalogue, read in layers
 * (sources, this machine's copy, the snapshot shipped with delendai), and
 * the names it gives to a key variable or a model.
 *
 * A pattern can say a variable looks like a credential; only a catalogue
 * can say `DASHSCOPE_API_KEY` is Alibaba's or who serves `qwen3.8-max`.
 * Keeping such a list by hand is the catalogue problem again. models.dev
 * is maintained in public, so a provider nobody here has heard of is named
 * the day it is listed there.
 */
import {
	MODEL_CATALOGUE_FORMAT,
	DEFAULT_CATALOGUE_SOURCES,
} from '../contracts/constants/public-catalogues.constant';
import type {
	ICatalogueProvider,
	IModelCatalogue,
} from '../contracts/interfaces/account-finding.interface';
import type {
	ICatalogueConditionalFetch,
	ICatalogueCopy,
} from '../contracts/interfaces/public-catalogue.interface';
import { migrateLegacyModelCatalogue } from './model-catalogue-cache.migration.service';
import { readPublicCatalogue } from './public-catalogue-sources.service';

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

/** Each model's `limit.context`, where the catalogue states a positive one. */
const contextWindowsOf = (
	models: unknown,
): Readonly<Record<string, number>> | undefined => {
	if (models === null || typeof models !== 'object') return undefined;
	const windows: Record<string, number> = {};
	for (const [id, model] of Object.entries(models)) {
		const limit =
			model !== null && typeof model === 'object' && 'limit' in model
				? model.limit
				: undefined;
		const context =
			limit !== null && typeof limit === 'object' && 'context' in limit
				? limit.context
				: undefined;
		if (typeof context === 'number' && context > 0) windows[id] = context;
	}
	return Object.keys(windows).length === 0 ? undefined : windows;
};

/** Each model's `[cost.input, cost.output]`, where the catalogue states both. */
const costsOf = (
	models: unknown,
): Readonly<Record<string, readonly [number, number]>> | undefined => {
	if (models === null || typeof models !== 'object') return undefined;
	const costs: Record<string, readonly [number, number]> = {};
	for (const [id, model] of Object.entries(models)) {
		const cost =
			model !== null && typeof model === 'object' && 'cost' in model
				? (model.cost as { input?: unknown; output?: unknown } | null)
				: undefined;
		if (
			typeof cost?.input === 'number' &&
			typeof cost.output === 'number' &&
			cost.input >= 0 &&
			cost.output >= 0
		)
			costs[id] = [cost.input, cost.output];
	}
	return Object.keys(costs).length === 0 ? undefined : costs;
};

/** The raw catalogue reduced to what naming and calling a provider need. */
export const compactCatalogue = (
	raw: unknown,
	now: Date = new Date(),
): IModelCatalogue | undefined => {
	if (raw === null || typeof raw !== 'object') return undefined;
	const providers: ICatalogueProvider[] = [];
	for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
		if (value === null || typeof value !== 'object') continue;
		const entry = value as Record<string, unknown>;
		providers.push({
			id,
			name: text(entry.name) ?? id,
			env: Array.isArray(entry.env)
				? entry.env.filter(
						(name): name is string => typeof name === 'string',
					)
				: [],
			models:
				entry.models !== null && typeof entry.models === 'object'
					? Object.keys(entry.models)
					: [],
			...(contextWindowsOf(entry.models) === undefined
				? {}
				: { contextWindows: contextWindowsOf(entry.models) }),
			...(costsOf(entry.models) === undefined
				? {}
				: { costs: costsOf(entry.models) }),
			...(text(entry.api) === undefined ? {} : { api: text(entry.api) }),
			...(text(entry.npm) === undefined ? {} : { npm: text(entry.npm) }),
			...(text(entry.doc) === undefined ? {} : { doc: text(entry.doc) }),
		});
	}
	return providers.length === 0
		? undefined
		: { fetchedAt: now.toISOString(), providers };
};

const isStringList = (value: unknown): boolean =>
	Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Whether cached data has the compact shape {@link compactCatalogue} writes. */
const isCompactCatalogue = (data: unknown): data is IModelCatalogue =>
	data !== null &&
	typeof data === 'object' &&
	'providers' in data &&
	Array.isArray(data.providers) &&
	data.providers.every(
		(provider: unknown) =>
			provider !== null &&
			typeof provider === 'object' &&
			'id' in provider &&
			typeof provider.id === 'string' &&
			'name' in provider &&
			typeof provider.name === 'string' &&
			'env' in provider &&
			isStringList(provider.env) &&
			'models' in provider &&
			isStringList(provider.models),
	);

/** The copy shipped with delendai: the last resort when no source answers and nothing is cached. */
export const shippedModelCatalogue = async (): Promise<
	ICatalogueCopy<IModelCatalogue> | undefined
> =>
	(await import('../../../data/model-catalogue.snapshot.json'))
		.default as unknown as ICatalogueCopy<IModelCatalogue>;

/**
 * The catalogue, from the first layer that has one: a source (asked only
 * whether it changed), this machine's copy, the shipped snapshot. Never
 * throws; `undefined` only when every layer is empty.
 */
export const readModelCatalogue = async (
	input: {
		readonly sources?: readonly string[] | undefined;
		readonly cacheDir?: string | undefined;
		readonly legacyPath?: string | undefined;
		readonly now?: Date | undefined;
		readonly fetch?: ICatalogueConditionalFetch | undefined;
		readonly snapshot?:
			| (() => Promise<ICatalogueCopy<IModelCatalogue> | undefined>)
			| undefined;
	} = {},
): Promise<IModelCatalogue | undefined> => {
	await migrateLegacyModelCatalogue({
		cacheDir: input.cacheDir,
		legacyPath: input.legacyPath,
		format: MODEL_CATALOGUE_FORMAT,
		now: input.now,
	});
	const now = input.now ?? new Date();
	const read = await readPublicCatalogue({
		kind: 'models',
		sources: input.sources ?? DEFAULT_CATALOGUE_SOURCES.models,
		compact: (raw) => compactCatalogue(raw, now),
		isData: isCompactCatalogue,
		format: MODEL_CATALOGUE_FORMAT,
		snapshot: input.snapshot ?? shippedModelCatalogue,
		cacheDir: input.cacheDir,
		now,
		fetch: input.fetch,
	});
	return read === undefined
		? undefined
		: { fetchedAt: read.meta.fetchedAt, providers: read.data.providers };
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

/**
 * The context window the catalogue states for `modelId`, matched as listed
 * or by its last path part (`qwen/qwen3.8-max` is `qwen3.8-max`); the
 * largest when providers disagree, `undefined` when none states one.
 */
export const modelContextWindow = (
	catalogue: IModelCatalogue | undefined,
	modelId: string,
): number | undefined => {
	const wanted = modelId.toLowerCase();
	const bare = (id: string): string => id.split('/').pop() ?? id;
	const found = (catalogue?.providers ?? []).flatMap((provider) =>
		Object.entries(provider.contextWindows ?? {})
			.filter(
				([id]) =>
					id.toLowerCase() === wanted ||
					bare(id).toLowerCase() === bare(wanted),
			)
			.map(([, window]) => window),
	);
	return found.length === 0 ? undefined : Math.max(...found);
};
