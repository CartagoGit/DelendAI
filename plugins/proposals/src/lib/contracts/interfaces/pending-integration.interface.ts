/**
 * pending-integration.interface.ts — f00091 S2.
 *
 * Types for the non-destructive "mark for integration" record that
 * `close_slice` writes and `swarm_hygiene` surfaces. Per repo
 * convention every interface/type lives under `contracts/interfaces/`;
 * the store (`shared/pending-integration-store.ts`) imports these.
 */

/** One branch that finished a slice and awaits deliberate integration. */
export interface IPendingIntegrationEntry {
	/** The agent branch that carries the finished slice (e.g. `agent/orion-f00091`). */
	readonly branch: string;
	/** Absolute worktree path that owns the branch, or `''` when unknown. */
	readonly worktreePath: string;
	/** The slice that was closed on the branch. */
	readonly sliceId: string;
	/** The proposal the slice belongs to. */
	readonly proposalId: string;
	/** ISO-8601 instant the entry was recorded. */
	readonly recordedAt: string;
}

/** Persisted state of the pending-integration list. */
export interface IPendingIntegrationState {
	readonly version: number;
	readonly entries: readonly IPendingIntegrationEntry[];
}

/** Durable, idempotent store for the pending-integration list. */
export interface IPendingIntegrationStore {
	readonly path: string;
	read(): Promise<IPendingIntegrationState>;
	/**
	 * Upsert one pending entry, keyed on `branch`. Idempotent: recording
	 * the same branch twice replaces the previous entry rather than
	 * appending a duplicate. Returns the entry list after the write.
	 */
	record(
		entry: IPendingIntegrationEntry,
	): Promise<readonly IPendingIntegrationEntry[]>;
	/**
	 * Drop every entry whose branch appears in `integratedBranches`
	 * (branches `swarm_hygiene` observed as `mergedIntoBase`). Returns
	 * `true` when at least one entry was removed.
	 */
	prune(integratedBranches: ReadonlySet<string>): Promise<boolean>;
}
