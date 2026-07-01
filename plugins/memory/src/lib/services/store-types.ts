/**
 * store-types.ts — the canonical `INote` shape and its close
 * companions. Extracted from the original `store.ts` so every other
 * store module (io, records, recall, portable) can import the type
 * without dragging the file's 477-line implementation along.
 *
 * SOLID — Interface Segregation. Consumers read only the fields
 * they need: `recall` projects to a smaller shape, `export` reads
 * the full note, `remove` reads only the id. The single source of
 * truth stays here.
 */

export interface INote {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly tags: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
	/** ISO timestamp after which the note is expired (TTL). Absent = never. */
	readonly expiresAt?: string;
}

export interface ISaveResult {
	readonly note: INote;
	/** How many secrets were redacted from title/body/tags before saving. */
	readonly redactions: number;
}

/** Default for the total-store quota when the plugin options don't
 * override it. Kept as a constant (not `export const MAX_NOTES`) so
 * callers go through `getMaxNotes(options)` instead of importing the
 * raw constant — this is the SOLID hook that makes the limit
 * configurable from `mcp-vertex.config.json#plugins.memory.options.maxNotes`. */
export const DEFAULT_MAX_NOTES = 1000;
