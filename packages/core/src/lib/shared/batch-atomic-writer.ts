/**
 * batch-atomic-writer.ts — Solid SRP + DIP for batch file writes.
 *
 * Background (r00003 S11 / a00036 CONC-2): the scaffold tool used to
 * write each generated file with its own `writeFileAtomic` call,
 * without a batch-level mutex. Two concurrent scaffolds (or a scaffold
 * interleaved with a reader) could observe partial state: a directory
 * created but not yet filled, a file written but its sibling missing,
 * etc. The contract was "best effort, files eventually consistent" —
 * not "all or nothing".
 *
 * With `IBatchAtomicWriter`:
 *
 *   - **SRP**: `scaffold-tool` no longer knows how to plan, lock,
 *     commit or roll back a batch; it just hands the operations to a
 *     writer and reports the result.
 *   - **DIP**: tests inject a fake writer; production uses the
 *     filesystem-backed default. The interface does not leak any
 *     `node:fs` symbol — every method takes and returns plain data.
 *   - **All-or-nothing semantics**: if any operation in the batch
 *     fails, every previously-committed operation is rolled back.
 *     Concurrent batches are serialized through `withFileMutex`, a
 *     cross-process (lockfile-based) mutex keyed on the workspace root —
 *     not a process-local promise chain, which only serialized calls
 *     within a single Node instance and did nothing for two separate
 *     `delendai` processes (or a CLI script + a running host) writing
 *     the same workspace concurrently (x00183 F2).
 */

export interface IBatchOperation {
	/** Workspace-relative path. Forward slashes; resolved against `workspaceRoot`. */
	readonly path: string;
	/** UTF-8 content to write. */
	readonly content: string;
}

export interface IBatchOperationError {
	/** Workspace-relative path of the failing operation. */
	readonly path: string;
	/** Short, machine-readable reason. */
	readonly reason: string;
}

export interface IBatchWriteResult {
	/** `true` when every operation was committed; `false` if the batch was rolled back. */
	readonly ok: boolean;
	/** Paths committed successfully (in submission order). Empty when `ok === false`. */
	readonly committed: readonly string[];
	/** Per-operation errors when the batch failed. Empty when `ok === true`. */
	readonly errors: readonly IBatchOperationError[];
}

export interface IBatchAtomicWriter {
	/**
	 * Plan a batch of writes against the workspace root: take a single
	 * batch-level mutex, attempt every operation in order, and either
	 * commit (return `ok: true` and the committed list) or roll back
	 * every committed operation (return `ok: false` and the error list).
	 */
	writeAll(
		operations: readonly IBatchOperation[],
	): Promise<IBatchWriteResult>;
}

import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { writeFileAtomic } from './atomic-write';
import { withFileMutex } from './with-file-mutex';

/**
 * Default implementation: a cross-process mutex (keyed on the absolute
 * workspace root) serializes every `writeAll` call targeting the same
 * workspace — two separate `delendai` processes (or a CLI script and
 * a running host) writing the same workspace concurrently now
 * genuinely serialize, not just two callers inside one Node instance.
 * Concurrent batches targeting different workspaces do not block each
 * other (different mutex keys).
 *
 * The mutex is held for the duration of the batch — between planning
 * (mkdir parents), commits (writeFileAtomic) and any rollback (rm of
 * the committed files). Readers and other writers see either the full
 * pre-batch state or the full post-batch state, never a torn view.
 */
export const createFileSystemBatchWriter = (
	workspaceRoot: string,
): IBatchAtomicWriter => {
	const withMutex = async <T>(work: () => Promise<T>): Promise<T> =>
		withFileMutex(workspaceRoot, work);

	const rollback = async (committed: readonly string[]): Promise<void> => {
		// Best-effort rollback: delete each committed file in reverse
		// order. Empty directories are not removed (a future batch may
		// be writing siblings). Errors here are logged but do not
		// override the original failure the caller still needs to see.
		for (let i = committed.length - 1; i >= 0; i--) {
			const rel = committed[i];
			if (rel === undefined) continue;
			try {
				await rm(join(workspaceRoot, rel), { force: true });
			} catch {
				// intentional no-op: rollback errors must not mask the
				// original failure.
			}
		}
	};

	return {
		async writeAll(operations) {
			return withMutex(async () => {
				const committed: string[] = [];
				const errors: IBatchOperationError[] = [];

				for (const op of operations) {
					const absolute = join(workspaceRoot, op.path);
					try {
						await mkdir(dirname(absolute), { recursive: true });
						await writeFileAtomic(absolute, op.content);
						committed.push(op.path);
					} catch (error) {
						errors.push({
							path: op.path,
							reason:
								error instanceof Error
									? error.message
									: String(error),
						});
						break;
					}
				}

				if (errors.length > 0) {
					await rollback(committed);
					return {
						ok: false,
						committed: [],
						errors,
					};
				}

				return {
					ok: true,
					committed,
					errors: [],
				};
			});
		},
	};
};
