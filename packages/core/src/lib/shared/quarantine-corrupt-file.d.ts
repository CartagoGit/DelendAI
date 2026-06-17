/**
 * Raised when a state file holds unparseable or schema-invalid content.
 * The corrupt file is preserved (renamed to a `.corrupt-<ts>` sidecar)
 * BEFORE this is thrown, so the original bytes are never lost and an
 * operator can inspect them. Critical-state readers (queue, registry,
 * memory) throw this instead of silently treating corruption as an empty
 * state — empty state would let two agents re-claim the same work.
 */
export declare class CorruptFileError extends Error {
    readonly originalPath: string;
    /** Where the corrupt bytes were moved, or null if the rename failed. */
    readonly backupPath: string | null;
    constructor(originalPath: string, backupPath: string | null, detail: string);
}
/**
 * Move a corrupt file aside (best-effort) and return the backup path, or
 * null if the rename failed (e.g. it vanished). Never throws.
 */
export declare const quarantineCorruptFile: (absolutePath: string) => Promise<string | null>;
/** Synchronous variant of {@link quarantineCorruptFile}. */
export declare const quarantineCorruptFileSync: (absolutePath: string) => string | null;
