/**
 * Public surface of `@cartago-git/mcp-memory`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * note store + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	readStore,
	writeStore,
	saveNote,
	recall,
	removeNote,
} from '../lib/store';
export type { INote } from '../lib/store';
export { rankNotes, tokenize } from '../lib/rank';
export type { IRankedNote } from '../lib/rank';
export { buildMemoryToolRegistrations } from '../lib/tools';
export type { IMemoryToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
