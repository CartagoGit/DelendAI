/**
 * batch-atomic-writer.interface.ts — the type-only half of the batch
 * atomic writer.
 *
 * These four types used to live beside the implementation in
 * `lib/shared/batch-atomic-writer.ts`, which imports `node:fs/promises`
 * and `node:path`. That made them unreachable from
 * `@delendai/core/contracts`: re-exporting a type from an
 * implementation module makes TypeScript type-check that whole module,
 * so the barrel would drag Node-only code and
 * `lint:core-contracts-library-safe` would fail.
 *
 * They move here as a set rather than one at a time because they
 * reference each other — `IBatchAtomicWriter` returns
 * `IBatchWriteResult`, which carries `IBatchOperationError`. Splitting
 * them would leave this module importing the remainder back from the
 * implementation and re-drag `node:fs`, which is the exact failure the
 * move exists to remove.
 *
 * The implementation module re-exports these names, so every existing
 * importer of `@delendai/core/public` keeps working unchanged.
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
