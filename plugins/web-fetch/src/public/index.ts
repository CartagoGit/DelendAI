/**
 * Public surface of `@mcp-vertex/web`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * fetch engine + tool builder for programmatic reuse.
 */
export { default } from '../index';

export { webFetch, isHostAllowed } from '../lib/engine';
export type {
	IWebFetchOptions,
	IWebFetchResult,
	IWebFetchSuccess,
	IWebFetchFailure,
	IWebFetchReason,
	IFetchLike,
} from '../lib/engine';
export { buildWebToolRegistrations } from '../lib/tools';
export type { IWebToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
