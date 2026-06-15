/**
 * promote-on-release.ts
 *
 * Auto-promoter hook for the agent-lock `release` action.
 * 
 *
 * Behavior:
 *   1. Read the queue (defensively — if the file is missing or empty,
 *      return a no-op result).
 *   2. For every entry with status: 'queued' whose waitFor[*].file is
 *      in `releasedFiles`, mutate status to 'promoted' and set
 *      promotedAt to now().
 *   3. Persist the updated queue atomically.
 *   4. Return the list of promoted taskIds and the count.
 *
 * Serialization:
 *   The function uses an in-process mutex so two concurrent calls
 *   (e.g., the orchestrator dispatching two release scripts in
 *   parallel) cannot double-promote the same entry. The mutex is
 *   keyed by `queuePath` so different queues can run in parallel.
 *
 * Consumed/cancelled/expired/promoted entries are no-ops — the
 * auto-promoter only touches 'queued' entries.
 */

import { existsSync, readFileSync } from 'node:fs';

import { writeFileAtomic } from '@cartago-git/mcp-core/public';

import type {
	IPersistentTaskEntry,
	IPersistentTaskQueue,
} from './persistent-task-queue';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IPromoteOnReleaseParams {
	readonly queuePath: string;
	readonly closedTasksPath: string;
	readonly releasedFiles: readonly string[];
}

export interface IPromoteOnReleaseResult {
	readonly promotedCount: number;
	readonly promotedTaskIds: readonly string[];
	readonly skippedCount: number;
}

// ---------------------------------------------------------------------------
// In-process mutex (keyed by queuePath)
// ---------------------------------------------------------------------------

interface IMutex {
	readonly queuePath: string;
	current: Promise<void>;
}

const mutexRegistry = new Map<string, IMutex>();

const withMutex = async <T>(
	queuePath: string,
	fn: () => Promise<T>
): Promise<T> => {
	const existing = mutexRegistry.get(queuePath);
	if (existing) {
		const prev = existing.current;
		let release!: () => void;
		existing.current = new Promise<void>((resolve) => {
			release = resolve;
		});
		await prev;
		try {
			return await fn();
		} finally {
			release();
		}
	}

	let release!: () => void;
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	mutexRegistry.set(queuePath, { queuePath, current: next });
	try {
		return await fn();
	} finally {
		release();
		// Only delete if we're still the current entry; otherwise a
		// newer mutex may have been installed.
		const latest = mutexRegistry.get(queuePath);
		if (latest && latest.current === next) {
			mutexRegistry.delete(queuePath);
		}
	}
};

// ---------------------------------------------------------------------------
// Atomic persist
// ---------------------------------------------------------------------------

const persistQueue = async (
	queue: IPersistentTaskQueue,
	queuePath: string
): Promise<void> => {
	await writeFileAtomic(queuePath, JSON.stringify(queue, null, 2));
};

// ---------------------------------------------------------------------------
// loadOrEmptyQueue
// ---------------------------------------------------------------------------

const loadOrEmptyQueue = (queuePath: string): IPersistentTaskQueue => {
	if (!existsSync(queuePath)) {
		return { version: 1, entries: [] };
	}
	try {
		const raw = readFileSync(queuePath, 'utf8');
		const parsed = JSON.parse(raw) as {
			version?: number;
			entries?: unknown[];
		};
		if (!parsed || !Array.isArray(parsed.entries)) {
			return { version: 1, entries: [] };
		}
		return parsed as IPersistentTaskQueue;
	} catch {
		return { version: 1, entries: [] };
	}
};

// ---------------------------------------------------------------------------
// promoteOnRelease
// ---------------------------------------------------------------------------

export const promoteOnRelease = async (
	params: IPromoteOnReleaseParams
): Promise<IPromoteOnReleaseResult> => {
	return withMutex(params.queuePath, async () => {
		const queue = loadOrEmptyQueue(params.queuePath);
		if (queue.entries.length === 0) {
			return { promotedCount: 0, promotedTaskIds: [], skippedCount: 0 };
		}

		const releasedSet = new Set(params.releasedFiles);
		const now = new Date().toISOString();
		const promotedTaskIds: string[] = [];
		let skippedCount = 0;

		const updatedEntries: IPersistentTaskEntry[] = queue.entries.map(
			(entry): IPersistentTaskEntry => {
				// Only touch queued entries
				if (entry.status !== 'queued') {
					return entry;
				}

				// Empty waitFor means no file dependency — no promotion trigger
				if (entry.waitFor.length === 0) {
					return entry;
				}

				// Check if ANY waitFor file is in the released set
				// (a waiter only proceeds when ALL its waitFor files are released;
				//  if even one file is still in_flight, the entry stays queued)
				const allReleased = entry.waitFor.every((wf) =>
					releasedSet.has(wf.file)
				);
				if (!allReleased) {
					skippedCount++;
					return entry;
				}

				promotedTaskIds.push(entry.taskId);
				return {
					...entry,
					status: 'promoted',
					promotedAt: now,
				};
			}
		);

		if (promotedTaskIds.length === 0) {
			return { promotedCount: 0, promotedTaskIds: [], skippedCount };
		}

		// Sort: priority desc, then enqueuedAt asc (consistent with enqueue())
		updatedEntries.sort((a, b) => {
			if (b.priority !== a.priority) return b.priority - a.priority;
			return Date.parse(a.enqueuedAt) - Date.parse(b.enqueuedAt);
		});

		const updatedQueue: IPersistentTaskQueue = {
			...queue,
			entries: updatedEntries,
		};
		await persistQueue(updatedQueue, params.queuePath);

		return {
			promotedCount: promotedTaskIds.length,
			promotedTaskIds,
			skippedCount,
		};
	});
};
