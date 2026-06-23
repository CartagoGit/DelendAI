/**
 * Public surface of `@mcp-vertex/docs`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * docs engine + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	listDocs,
	readDoc,
	searchDocs,
	extractTitle,
	DEFAULT_DOC_ROOTS,
} from '../lib/services/engine';
export type {
	IDocEntry,
	IDocContent,
	IDocsOptions,
	IDocSearchHit,
} from '../lib/services/engine';
export { buildDocsToolRegistrations } from './lib/tools/tools';
export type { IDocsToolOptions } from './lib/tools/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
