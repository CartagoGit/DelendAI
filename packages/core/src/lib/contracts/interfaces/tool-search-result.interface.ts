import type { IToolSurfaceSearchEntry } from './tool-surface.interface';

/** What a catalog search can answer, including that it has no answer. */
export interface IToolSearchResult {
	/** Ranked matches; empty when `found` is false. */
	readonly entries: readonly IToolSurfaceSearchEntry[];
	/**
	 * False when a query matched nothing, or matched only below the
	 * confidence threshold: the caller is told so instead of receiving
	 * whatever happened to contain the query's letters.
	 */
	readonly found: boolean;
	/** What to try next; present whenever `found` is false. */
	readonly suggestion?: string;
}

/** The inputs a catalog search accepts. */
export interface IToolSearchInput {
	readonly query?: string | undefined;
	readonly activeOnly?: boolean | undefined;
	readonly plugin?: string | undefined;
	readonly tag?: string | undefined;
	readonly limit?: number | undefined;
	/**
	 * Lowest relevance a query's best match must reach to count as found;
	 * 0 accepts any match. Ignored without a query.
	 */
	readonly minScore?: number | undefined;
}
