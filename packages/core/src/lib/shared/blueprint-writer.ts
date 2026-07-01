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

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { withFileMutex } from './with-file-mutex';
import { writeFileAtomic } from './atomic-write';
import { quarantineCorruptFile } from './quarantine-corrupt-file';

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

/**
 * Probe an existing blueprint and classify it:
 *
 *   - `'missing'`  — no file at the path; the caller should write.
 *   - `'intact'`   — a file exists and parses as JSON; preserve it.
 *   - `'corrupt'`  — a file exists but does NOT parse; the caller must
 *                    quarantine it (corrupt ≠ empty, AGENTS.md invariant
 *                    4) and then write a fresh blueprint.
 */
const probeBlueprint = async (
	absolutePath: string,
): Promise<'missing' | 'intact' | 'corrupt'> => {
	let bytes: string;
	try {
		bytes = await readFile(absolutePath, 'utf8');
	} catch {
		return 'missing';
	}
	try {
		JSON.parse(bytes);
		return 'intact';
	} catch {
		return 'corrupt';
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
			// First check: cheap fail-fast before taking the lock. An
			// intact blueprint short-circuits without the mutex.
			if ((await probeBlueprint(absolute)) === 'intact') {
				return { written: false, path: relativePath };
			}
			return withFileMutex(absolute, async () => {
				// Second probe inside the lock: a peer may have raced
				// past the first check and written before we got here.
				const state = await probeBlueprint(absolute);
				if (state === 'intact') {
					return { written: false, path: relativePath };
				}
				if (state === 'corrupt') {
					// corrupt ≠ empty: move the unparseable bytes aside
					// (preserved as a `.corrupt-*` sidecar) before we
					// overwrite, so an operator can inspect them.
					await quarantineCorruptFile(absolute);
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
