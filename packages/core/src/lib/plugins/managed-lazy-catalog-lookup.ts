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
export const managedLazyPluginEntry = (
	id: string,
): IManagedLazyPluginCatalogEntry | undefined => ENTRIES_BY_ID.get(id);
