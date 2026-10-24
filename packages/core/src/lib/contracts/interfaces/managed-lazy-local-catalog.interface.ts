/**
 * managed-lazy-local-catalog.interface.ts — what a project records about
 * the plugins it ships itself, so they load lazily like delendai's own.
 */
import type { IManagedLazyPluginCatalogEntry } from '../../plugins/managed-lazy-catalog.generated';

/** One recorded plugin: its entry, and the file state it was recorded from. */
export interface ILocalLazyCatalogRecord {
	/** The specifier the configuration names, e.g. `./libs/plugins/x/src/index.ts`. */
	readonly specifier: string;
	/** The module file the specifier resolved to. */
	readonly resolved: string;
	/** The file's size and modification time when it was recorded. */
	readonly fingerprint: { readonly size: number; readonly mtimeMs: number };
	readonly entry: IManagedLazyPluginCatalogEntry;
}

export interface ILocalLazyCatalogFile {
	readonly version: 1;
	readonly records: readonly ILocalLazyCatalogRecord[];
}
