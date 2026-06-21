/**
 * Public surface of `@mcp-vertex/memory`. The default export (in
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
	exportNotes,
	importNotes,
} from '../lib/store';
export type {
	INote,
	ISaveResult,
	IMemoryExportFormat,
	IMemoryImportFormat,
	IMemoryImportMode,
	IMemoryImportConflict,
	IMemoryImportResult,
} from '../lib/store';
export { redactSecrets } from '../lib/redact';
export type { IRedactResult } from '../lib/redact';
export { rankNotes, tokenize } from '../lib/rank';
export type { IRankedNote } from '../lib/rank';
export { buildMemoryToolRegistrations } from '../lib/tools';
export type { IMemoryToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
