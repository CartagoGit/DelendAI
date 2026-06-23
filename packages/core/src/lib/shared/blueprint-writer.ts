/**
 * blueprint-writer.ts — Solid SRP + DIP for first-start blueprints.
 *
 * Background (r00003 S1 / a00036 F-002): the
 * `prepareServerBlueprintOnStart` hook used to do `existsSync → mkdir →
 * writeFile` directly, with no mutex and no atomic write. Two
 * concurrent first-starts could both observe the blueprint missing and
 * write conflicting bytes; readers during the gap could observe a
 * torn file (a half-written JSON body, a file that appears and then
 * disappears, two competing writes that overwrite each other).
 *
 * With `IBlueprintWriter`:
 *
 *   - **SRP**: `assemble.ts` no longer worries about the existence
 *     check, the mutex, the atomic write, the directory creation or the
 *     JSON serialization — it just hands the payload to a writer and
 *     reports the result.
 *   - **DIP**: tests inject a fake writer to assert behaviour without
 *     touching the filesystem; production uses the filesystem-backed
 *     default. The interface does not leak any `node:fs` symbol.
 *   - **All-or-nothing / once**: every write either lands in full or
 *     not at all (atomic rename), and the existence check is repeated
 *     INSIDE the mutex so two concurrent callers cannot both pass the
 *     check.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { withFileMutex } from './with-file-mutex';
import { writeFileAtomic } from './atomic-write';

export interface IBlueprintPayload {
	readonly generatedAt: string;
	readonly blueprint: unknown;
}

export interface IBlueprintWriteResult {
	/** `true` when this call wrote the file; `false` when the file already existed. */
	readonly written: boolean;
	/** Workspace-relative path of the blueprint file. */
	readonly path: string;
}

export interface IBlueprintWriter {
	/**
	 * Idempotently write the blueprint to `<workspace>/<relativePath>`.
	 * Returns `{ written: true, path }` if the call performed the write;
	 * returns `{ written: false, path }` if the file already existed
	 * and the original bytes are preserved.
	 *
	 * Concurrent calls are serialized: at most one wins, the rest
	 * observe the file already exists.
	 */
	writeOnce(
		workspaceRoot: string,
		relativePath: string,
		payload: IBlueprintPayload,
	): Promise<IBlueprintWriteResult>;
}

const exists = async (absolutePath: string): Promise<boolean> => {
	try {
		await (await import('node:fs/promises')).stat(absolutePath);
		return true;
	} catch {
		return false;
	}
};

/**
 * Default implementation: a process-local mutex (keyed by the absolute
 * path of the blueprint) serializes concurrent `writeOnce` calls. Inside
 * the mutex the existence check is repeated (double-check pattern) so
 * two callers cannot both pass the check and overwrite each other.
 *
 * The write itself goes through `writeFileAtomic` (temp + rename in
 * the same directory), which is what makes a reader never observe a
 * half-written file.
 */
export const createFileSystemBlueprintWriter = (): IBlueprintWriter => ({
	async writeOnce(workspaceRoot, relativePath, payload) {
		const absolute = join(workspaceRoot, relativePath);

		const tryWrite = async (): Promise<IBlueprintWriteResult> => {
			// First check: cheap fail-fast before taking the lock.
			if (await exists(absolute)) {
				return { written: false, path: relativePath };
			}
			return withFileMutex(absolute, async () => {
				// Second check inside the lock: a peer may have raced
				// past the first check and written before we got here.
				if (await exists(absolute)) {
					return { written: false, path: relativePath };
				}
				await mkdir(dirname(absolute), { recursive: true });
				await writeFileAtomic(
					absolute,
					`${JSON.stringify(payload, null, '\t')}\n`,
				);
				return { written: true, path: relativePath };
			});
		};

		return tryWrite();
	},
});
