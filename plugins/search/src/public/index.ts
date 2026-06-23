/**
 * Public surface of `@mcp-vertex/search`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * search engine + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	searchWorkspace,
	InvalidSearchPatternError,
} from '../lib/services/search-engine.service';
export type {
	ISearchHit,
	ISearchResult,
	ISearchOptions,
} from '../lib/services/search-engine.service';
export { buildSearchToolRegistrations } from '../lib/tools/search.tool';
export type { ISearchToolOptions } from '../lib/tools/search.tool';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
