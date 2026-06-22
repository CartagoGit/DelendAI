/**
 * Typed models for the search service (S2 in f00023).
 * Wraps the `search_search` tool + provides a higher-level
 * "search the live tool registry" helper that doesn't need a server
 * round-trip.
 */

export interface ISearchHit {
	readonly file: string;
	readonly line: number;
	readonly text: string;
}

export interface ISearchResult {
	readonly query: string;
	readonly count: number;
	readonly truncated: boolean;
	readonly scanned: number;
	readonly hits: readonly ISearchHit[];
}

export interface ISearchOptions {
	readonly query: string;
	readonly roots?: readonly string[];
	readonly maxResults?: number;
	readonly caseSensitive?: boolean;
	readonly regex?: boolean;
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
}

/** A hit from the live tool registry (no server round-trip). */
export interface IToolHit {
	readonly name: string;
	readonly plugin: string;
	readonly score: number;
	readonly source: 'tag' | 'description' | 'name';
}

export interface IKnowledgeHit {
	readonly id: string;
	readonly title: string;
	readonly score: number;
}
