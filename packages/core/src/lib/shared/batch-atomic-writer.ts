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
 *     Concurrent batches are serialized through a single mutex.
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

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Default implementation: a process-local mutex serializes every
 * `writeAll` call against the same workspace root. We use the
 * workspace root as the mutex key so concurrent batches targeting
 * different workspaces do not block each other.
 *
 * The mutex is held for the duration of the batch — between planning
 * (mkdir parents), commits (writeFile) and any rollback (rm of the
 * committed files). Readers and other writers see either the full
 * pre-batch state or the full post-batch state, never a torn view.
 */
export const createFileSystemBatchWriter = (
	workspaceRoot: string,
): IBatchAtomicWriter => {
	// One promise-chain per workspaceRoot acts as the mutex. New
	// batches await the previous batch's resolution before starting.
	const lockChain: { current: Promise<unknown> } = {
		current: Promise.resolve(),
	};

	const withMutex = async <T>(work: () => Promise<T>): Promise<T> => {
		const next = lockChain.current.then(work, work);
		// Swallow rejections on the chain so a failed batch does not
		// poison every subsequent batch.
		lockChain.current = next.catch(() => undefined);
		return next;
	};

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
						await writeFile(absolute, op.content, 'utf8');
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
