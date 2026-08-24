/**
 * resolve.ts — f00141 S1: pure plugin-registry resolver.
 *
 * Pure over its inputs: takes an array of sources (default = the
 * bundled first-party index) plus filter options, returns a sorted
 * list of matching entries. No fs, no network, no host config — the
 * `plugin_search` MCP tool and the `mcpv plugin search` CLI both
 * compose this function; the runtime work (network install, config
 * wiring) is S2's job.
 *
 * Filtering:
 *  - `tags`: AND match (entry must carry every requested tag).
 *  - `origin`: include only entries of the requested origin
 *    (default = both first-party and community).
 *  - `query`: case-insensitive substring match across `id`,
 *    `package`, and `summary`.
 *  - `limit`: hard cap (default 50, max 200).
 */
import type {
	IPluginRegistryEntry,
	IPluginRegistrySource,
	IResolvePluginsOptions,
	IResolvePluginsResult,
} from '../contracts/interfaces/plugin-registry.interface';
import { FIRST_PARTY_PLUGIN_INDEX } from './first-party-index';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const matchesTags = (
	entry: IPluginRegistryEntry,
	tags: readonly string[] | undefined,
): boolean => {
	if (tags === undefined || tags.length === 0) return true;
	const entryTags = new Set(entry.tags);
	for (const tag of tags) {
		if (!entryTags.has(tag)) return false;
	}
	return true;
};

const matchesOrigin = (
	entry: IPluginRegistryEntry,
	origin: 'first-party' | 'community' | undefined,
): boolean => origin === undefined || entry.origin === origin;

const matchesQuery = (
	entry: IPluginRegistryEntry,
	query: string | undefined,
): boolean => {
	if (query === undefined || query.trim() === '') return true;
	const needle = query.trim().toLowerCase();
	const haystack = [entry.id, entry.package, entry.summary]
		.join('\n')
		.toLowerCase();
	return haystack.includes(needle);
};

/** Rank: pinned (default-preset) > lower id. Deterministic. */
const rankEntries = (
	a: IPluginRegistryEntry,
	b: IPluginRegistryEntry,
): number => {
	const aPinned = a.defaultPreset !== undefined ? 0 : 1;
	const bPinned = b.defaultPreset !== undefined ? 0 : 1;
	if (aPinned !== bPinned) return aPinned - bPinned;
	return a.id.localeCompare(b.id);
};

const resolveSources = (
	sources: readonly IPluginRegistrySource[] | undefined,
): readonly IPluginRegistrySource[] => {
	if (sources === undefined || sources.length === 0) {
		return [FIRST_PARTY_PLUGIN_INDEX];
	}
	if (sources.some((source) => source.origin === 'first-party')) {
		return sources;
	}
	return [FIRST_PARTY_PLUGIN_INDEX, ...sources];
};

export const resolvePlugins = (
	options: IResolvePluginsOptions = {},
): IResolvePluginsResult => {
	const sources = resolveSources(options.sources);
	const all = sources.flatMap((source) => source.entries);
	const filtered = all.filter(
		(entry) =>
			matchesTags(entry, options.tags) &&
			matchesOrigin(entry, options.origin) &&
			matchesQuery(entry, options.query),
	);
	const sorted = [...filtered].sort(rankEntries);
	const requestedLimit = options.limit ?? DEFAULT_LIMIT;
	const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
	const sliced = sorted.slice(0, limit);
	return {
		entries: sliced,
		total: sorted.length,
		truncated: sorted.length > sliced.length,
	};
};
