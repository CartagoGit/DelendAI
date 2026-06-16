/**
 * Public surface of `@cartago-git/mcp-search`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * search engine + tool builder for programmatic reuse.
 */
export { default } from '../index';

export { searchWorkspace } from '../lib/engine';
export type {
	ISearchHit,
	ISearchResult,
	ISearchOptions,
} from '../lib/engine';
export { buildSearchToolRegistrations } from '../lib/tools';
export type { ISearchToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
