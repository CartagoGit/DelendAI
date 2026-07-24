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
} from '../lib/services/store';
export type {
	INote,
	ISaveResult,
	IMemoryExportFormat,
	IMemoryImportFormat,
	IMemoryImportMode,
	IMemoryImportConflict,
	IMemoryImportResult,
} from '../lib/services/store';
export { redactSecrets } from '../lib/services/redact';
export type { IRedactResult } from '../lib/services/redact';
export { rankNotes, tokenize } from '../lib/services/rank';
export type { IRankedNote } from '../lib/services/rank';
export { buildMemoryToolRegistrations } from '../lib/tools';
export type { IMemoryToolOptions } from '../lib/tools';
export {
	buildCheckpointPacket,
	DEFAULT_CHECKPOINT_PACKET_MAX_DIGEST_CHARS,
} from '../lib/services/checkpoint-packet';
export type { ICheckpointPacket } from '../lib/services/checkpoint-packet';
export {
	assessCheckpointFreshness,
	DEFAULT_CHECKPOINT_MAX_AGE_MS,
} from '../lib/services/checkpoint-freshness';
export type {
	CheckpointFreshnessState,
	ICheckpointFreshness,
} from '../lib/services/checkpoint-freshness';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
