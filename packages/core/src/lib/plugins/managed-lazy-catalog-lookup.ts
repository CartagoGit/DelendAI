/**
 * Lookup over the generated managed lazy catalog.
 *
 * The generated module exports the catalog and nothing derived from it.
 * Its own generator imports the core that reads it, so a stale copy that
 * lacks a newer export breaks the import chain of the very generator that
 * would replace it. The catalog array is the one export every version of
 * that file has carried; everything derived from it is computed here.
 */

import {
	MANAGED_LAZY_PLUGIN_CATALOG,
	type IManagedLazyPluginCatalogEntry,
} from './managed-lazy-catalog.generated';

const ENTRIES_BY_ID: ReadonlyMap<string, IManagedLazyPluginCatalogEntry> =
	new Map(MANAGED_LAZY_PLUGIN_CATALOG.map((entry) => [entry.id, entry]));

/** The catalog entry of a managed plugin, or undefined when it has none. */
/**
 * The entries this project recorded for plugins delendai does not ship,
 * keyed by id, and the specifier each was configured with. See
 * `managed-lazy-local-catalog.service.ts`.
 */
const LOCAL_BY_ID = new Map<string, IManagedLazyPluginCatalogEntry>();
const LOCAL_ID_BY_SPECIFIER = new Map<string, string>();

export const managedLazyPluginEntry = (
	id: string,
): IManagedLazyPluginCatalogEntry | undefined =>
	ENTRIES_BY_ID.get(id) ?? LOCAL_BY_ID.get(id);

/** Whether `id` is a plugin this project recorded, not one delendai ships. */
export const isLocalLazyPlugin = (id: string): boolean =>
	!ENTRIES_BY_ID.has(id) && LOCAL_BY_ID.has(id);

/** The id a project-local plugin's specifier was recorded under, if it was. */
export const localLazyPluginIdFor = (specifier: string): string | undefined =>
	LOCAL_ID_BY_SPECIFIER.get(specifier);

/** Makes this project's recorded entries part of the lookup, replacing earlier ones. */
export const useLocalLazyEntries = (
	entries: readonly {
		readonly specifier: string;
		readonly entry: IManagedLazyPluginCatalogEntry;
	}[],
): void => {
	LOCAL_BY_ID.clear();
	LOCAL_ID_BY_SPECIFIER.clear();
	for (const { specifier, entry } of entries) {
		if (ENTRIES_BY_ID.has(entry.id)) continue;
		LOCAL_BY_ID.set(entry.id, entry);
		LOCAL_ID_BY_SPECIFIER.set(specifier, entry.id);
	}
};
