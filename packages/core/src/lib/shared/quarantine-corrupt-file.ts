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
 * Filesystem errors that are TRANSIENT under heavy parallel load (too
 * many open fds, a briefly-locked file) and worth retrying. `ENOENT`
 * (the file genuinely vanished) is deliberately absent — there is nothing
 * left to preserve, so we return `null` immediately without backoff.
 */
const TRANSIENT_RENAME_CODES: ReadonlySet<string> = new Set([
	'EAGAIN',
	'EBUSY',
	'EMFILE',
	'ENFILE',
	'EPERM', // Windows surfaces a transient lock as EPERM
	'ETXTBSY',
]);

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Move a corrupt file aside and return the backup path, or `null` if it
 * cannot be preserved. Never throws.
 *
 * a00070: this is a last-resort data-preservation step — losing the
 * corrupt bytes defeats the whole point (a reader would then treat the
 * missing file as an empty store). So a TRANSIENT rename failure
 * (EAGAIN/EMFILE/EBUSY under heavy parallel fs load) is RETRIED with a
 * short backoff instead of giving up on the first error. `ENOENT` (the
 * file is already gone) returns `null` immediately; a persistent error
 * returns `null` after the retries are exhausted.
 */
export const quarantineCorruptFile = async (
	absolutePath: string,
	deps: {
		readonly rename?: (from: string, to: string) => Promise<void>;
		readonly sleep?: (ms: number) => Promise<void>;
	} = {},
): Promise<string | null> => {
	const renameFn = deps.rename ?? rename;
	const sleep = deps.sleep ?? defaultSleep;
	const backup = backupPathFor(absolutePath);
	const MAX_ATTEMPTS = 4;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		try {
			await renameFn(absolutePath, backup);
			return backup;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (
				attempt === MAX_ATTEMPTS ||
				code === undefined ||
				!TRANSIENT_RENAME_CODES.has(code)
			) {
				return null;
			}
			await sleep(5 * attempt); // 5ms, 10ms, 15ms — bounded, non-blocking
		}
	}
	return null;
};

/**
 * Synchronous variant of {@link quarantineCorruptFile}.
 *
 * Boot-time one-shot only — hot paths must use the async variant. No
 * `*Sync` filesystem calls inside tool handlers or engines (AGENTS.md
 * invariant 3).
 */
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
