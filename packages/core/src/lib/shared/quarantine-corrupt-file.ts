import { renameSync } from 'node:fs';
import { rename } from 'node:fs/promises';

/**
 * Raised when a state file holds unparseable or schema-invalid content.
 * The corrupt file is preserved (renamed to a `.corrupt-<ts>` sidecar)
 * BEFORE this is thrown, so the original bytes are never lost and an
 * operator can inspect them. Critical-state readers (queue, registry,
 * memory) throw this instead of silently treating corruption as an empty
 * state — empty state would let two agents re-claim the same work.
 */
export class CorruptFileError extends Error {
	readonly originalPath: string;
	/** Where the corrupt bytes were moved, or null if the rename failed. */
	readonly backupPath: string | null;

	constructor(
		originalPath: string,
		backupPath: string | null,
		detail: string,
	) {
		super(
			backupPath
				? `File "${originalPath}" is corrupt (${detail}); preserved at "${backupPath}".`
				: `File "${originalPath}" is corrupt (${detail}); backup rename failed.`,
		);
		this.name = 'CorruptFileError';
		this.originalPath = originalPath;
		this.backupPath = backupPath;
	}
}

/**
 * Build a collision-proof backup path next to the original. The random
 * suffix means two readers that detect corruption in the same millisecond
 * (e.g. a store with no read mutex) still get distinct backups.
 */
const backupPathFor = (absolutePath: string): string =>
	`${absolutePath}.corrupt-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}`;

/**
 * Move a corrupt file aside (best-effort) and return the backup path, or
 * null if the rename failed (e.g. it vanished). Never throws.
 */
export const quarantineCorruptFile = async (
	absolutePath: string,
): Promise<string | null> => {
	const backup = backupPathFor(absolutePath);
	try {
		await rename(absolutePath, backup);
		return backup;
	} catch {
		return null;
	}
};

/** Synchronous variant of {@link quarantineCorruptFile}. */
export const quarantineCorruptFileSync = (
	absolutePath: string,
): string | null => {
	const backup = backupPathFor(absolutePath);
	try {
		renameSync(absolutePath, backup);
		return backup;
	} catch {
		return null;
	}
};
