/**
 * pending-integration-store.ts — f00091 S2.
 *
 * A tiny durable store for the **branch-integration step** of
 * `close_slice`. When a swarm agent finishes a slice on its own
 * `agent/*` branch/worktree, `close_slice` records that branch here as
 * *pending integration*; `swarm_hygiene` surfaces the list as a rescue
 * candidate for a human/orchestrator to integrate deliberately.
 *
 * ## Contract (f00091)
 *
 *   - **Non-destructive.** This store only records + reads bookkeeping.
 *     It never runs git. `close_slice` writes an entry; `swarm_hygiene`
 *     reads it and prunes entries whose branch has already merged.
 *   - **No-op when `agentWorktree` is off.** The default flow has no
 *     agent branch, so `close_slice` records nothing and the file is
 *     never created. Behaviour is byte-identical to today.
 *   - **Idempotent.** `record` upserts keyed on `branch`: re-closing the
 *     same slice does not duplicate the entry. `prune` removes any entry
 *     whose branch is already integrated (`mergedIntoBase`).
 *
 * Durable-write discipline mirrors `agent-registry-store.ts`: the
 * read-modify-write critical section runs under a file mutex, and the
 * write itself is atomic (temp-in-same-dir + rename), so two agents
 * closing slices concurrently never lose an entry or read a torn file.
 */
import { readFile } from 'node:fs/promises';

import {
	CorruptFileError,
	quarantineCorruptFile,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

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

export interface IPendingIntegrationState {
	readonly version: number;
	readonly entries: readonly IPendingIntegrationEntry[];
}

const PENDING_INTEGRATION_VERSION = 1;

const emptyState = (): IPendingIntegrationState => ({
	version: PENDING_INTEGRATION_VERSION,
	entries: [],
});

const normalize = (raw: unknown): IPendingIntegrationState => {
	if (typeof raw !== 'object' || raw === null) return emptyState();
	const r = raw as Partial<IPendingIntegrationState>;
	const entries = Array.isArray(r.entries)
		? (r.entries as IPendingIntegrationEntry[]).filter(
				(e) => typeof e?.branch === 'string' && e.branch.length > 0,
			)
		: [];
	return {
		version:
			typeof r.version === 'number'
				? r.version
				: PENDING_INTEGRATION_VERSION,
		entries,
	};
};

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

export const createPendingIntegrationStore = (
	path: string,
): IPendingIntegrationStore => {
	const read = async (): Promise<IPendingIntegrationState> => {
		let raw: string;
		try {
			raw = await readFile(path, 'utf8');
		} catch (err: unknown) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT')
				return emptyState();
			throw err;
		}
		if (!raw.trim()) return emptyState();
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			const backup = await quarantineCorruptFile(path);
			throw new CorruptFileError(
				path,
				backup,
				`invalid JSON: ${String(err)}`,
			);
		}
		return normalize(parsed);
	};

	const write = async (state: IPendingIntegrationState): Promise<void> => {
		await writeFileAtomic(path, `${JSON.stringify(state, null, '    ')}\n`);
	};

	const record = async (
		entry: IPendingIntegrationEntry,
	): Promise<readonly IPendingIntegrationEntry[]> =>
		withFileMutex(path, async () => {
			const state = await read();
			const others = state.entries.filter((e) => e.branch !== entry.branch);
			const next: IPendingIntegrationState = {
				version: PENDING_INTEGRATION_VERSION,
				entries: [...others, entry],
			};
			await write(next);
			return next.entries;
		});

	const prune = async (
		integratedBranches: ReadonlySet<string>,
	): Promise<boolean> =>
		withFileMutex(path, async () => {
			const state = await read();
			const kept = state.entries.filter(
				(e) => !integratedBranches.has(e.branch),
			);
			if (kept.length === state.entries.length) return false;
			await write({ version: PENDING_INTEGRATION_VERSION, entries: kept });
			return true;
		});

	return { path, read, record, prune };
};
