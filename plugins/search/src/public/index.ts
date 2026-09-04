/**
 * Public surface of `@delendai/search`. The default export (in
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
export {
	buildDeterministicHashEmbedder,
	defaultEmbedder,
	DEFAULT_EMBED_DIMENSIONS,
} from '../lib/embed/embedder';
export type { IEmbedder } from '../lib/embed/embedder';
export {
	buildApiEmbedder,
	EmbedderUnavailableError,
} from '../lib/embed/build-api-embedder';
export type {
	IApiEmbedderFetch,
	IBuildApiEmbedderOptions,
} from '../lib/embed/build-api-embedder';
export {
	discoverProviders,
	resolveProviderApiKey,
} from '../lib/embed/providers';
export type {
	IDiscoveredEmbedProvider,
	IEmbedProviderId,
} from '../lib/embed/providers';
export {
	createEmbedIndexStore,
	resolveEmbedIndexPath,
} from '../lib/embed/index-store';
export type {
	IEmbedIndex,
	IEmbedIndexEntry,
	IEmbedIndexStore,
	IEmbedIndexStoreOptions,
} from '../lib/embed/index-store';
export {
	discoverEmbeddableFiles,
	hashContent,
	runEmbedPipeline,
} from '../lib/embed/embed-pipeline';
export type {
	IDiscoveredEmbedFile,
	IEmbedPipelineOptions,
	IEmbedPipelineResult,
} from '../lib/embed/embed-pipeline';
export { runSearchWithMode } from '../lib/tools/search-semantic.tool';
export type {
	ISearchSemanticToolOptions,
	ISearchToolArgs,
	SearchMode,
} from '../lib/tools/search-semantic.tool';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
