/**
 * persistent-task-queue.ts
 *
 * IPersistentTaskQueue — cola duradera persistida en disco.
 * Persistent task-queue implementation.
 *
 * Depends on: Zod (already in stack), Bun.write (built-in), fs/promises.
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { quarantineCorruptFile, writeFileAtomic } from '@mcp-vertex/core/public';

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type ITaskQueueErrorCode =
	| 'INVALID_TASK_QUEUE'
	| 'DUPLICATE_TASK_ID'
	| 'INVALID_PRIORITY'
	| 'WAIT_FOR_FILE_MISSING'
	| 'OBSERVE_TARGET_UNKNOWN'
	| 'TEMPORAL_INCONSISTENCY'
	| 'TASK_NOT_FOUND'
	| 'PARSE_ERROR';

export interface ITaskQueueError {
	readonly code: ITaskQueueErrorCode;
	readonly path: string;
	readonly field?: string;
	readonly message: string;
}

export class TaskQueueParseError extends Error {
	readonly code: ITaskQueueErrorCode;
	readonly path: string;
	readonly field?: string | undefined;

	constructor(
		code: ITaskQueueErrorCode,
		path: string,
		message: string,
		field?: string
	) {
		super(message);
		this.name = 'TaskQueueParseError';
		this.code = code;
		this.path = path;
		this.field = field;
	}

	toJSON(): ITaskQueueError {
		return {
			code: this.code,
			path: this.path,
			...(this.field ? { field: this.field } : {}),
			message: this.message,
		};
	}
}

// ---------------------------------------------------------------------------
// Agent slot types
// ---------------------------------------------------------------------------

/**
 * The canonical swarm roles, kept as the documented DEFAULT set — NOT an
 * enforced enum. `agentSlot` accepts any non-empty string so external projects
 * can use their own role vocabulary (the project-agnostic contract). These five
 * are what the bundled scaffold/agents use out of the box.
 */
export const DEFAULT_AGENT_SLOTS = [
	'orchestrator',
	'proposal_guardian',
	'implementation_runner',
	'delivery_verifier',
	'technical_investigator',
] as const;

export type IAgentSlot = string;

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

export interface IWaitForFile {
	readonly file: string;
	readonly releasedBy: string | null;
}

export interface ITaskQueueOwner {
	readonly taskId: string;
	readonly agentName: string;
	readonly agentSlot: IAgentSlot;
}

export type ITaskStatus =
	| 'queued'
	| 'promoted'
	| 'consumed'
	| 'cancelled'
	| 'expired';

export interface IPersistentTaskEntry {
	readonly taskId: string;
	readonly enqueuedAt: string;
	readonly priority: 1 | 2 | 3 | 4 | 5;
	readonly waitFor: readonly IWaitForFile[];
	readonly owner: ITaskQueueOwner;
	readonly observe: readonly string[];
	status: ITaskStatus;
	promotedAt?: string;
	consumedAt?: string;
	cancelledAt?: string;
	expiresAt?: string;
}

export interface IPersistentTaskQueue {
	readonly version: 1;
	entries: IPersistentTaskEntry[];
}

// ---------------------------------------------------------------------------
// Lock snapshot types (used by promote / reportBackpressure)
// ---------------------------------------------------------------------------

// Single source of truth: the on-disk lock shape written by
// `<prefix>_agent_lock` (agent-lock-engine). No compat alias for the old
// `files`/`claimed_at` shape — that dual schema was M7's debt.
export interface ILockEntry {
	readonly task_id: string;
	readonly agent: string;
	readonly ownership: readonly string[];
	readonly started_at: string;
	readonly last_seen?: string;
}

export interface ILockRelease {
	readonly taskId: string;
	readonly releasedAt: string;
	readonly files: readonly string[];
}

export interface ILockSnapshot {
	readonly in_flight: readonly ILockEntry[];
	readonly recentReleases: readonly ILockRelease[];
}

// ---------------------------------------------------------------------------
// Backpressure
// ---------------------------------------------------------------------------

export type IBackpressureThreshold = 'green' | 'amber' | 'red';

export interface IBackpressureReport {
	readonly queueLength: number;
	readonly queuedCount: number;
	readonly promotedCount: number;
	readonly consumedCount: number;
	readonly cancelledCount: number;
	readonly expiredCount: number;
	readonly oldestAgeMinutes: number;
	readonly waiterOrphans: number;
	readonly releaseSignalBacklog: number;
	readonly threshold: IBackpressureThreshold;
}

// ---------------------------------------------------------------------------
// Subscribe digest
// ---------------------------------------------------------------------------

export interface IClosedTaskDigest {
	readonly taskId: string;
	readonly closedAt: string;
	readonly diffSummary?: string;
}

export interface ISubscribeResult {
	readonly digests: IClosedTaskDigest[];
	readonly pendingTargets: string[];
}

// ---------------------------------------------------------------------------
// Zod schemas for runtime validation
// ---------------------------------------------------------------------------

const WaitForFileSchema = z.object({
	file: z.string().min(1),
	releasedBy: z.string().nullable(),
});

const TaskQueueOwnerSchema = z.object({
	taskId: z.string().min(1),
	agentName: z.string().min(1),
	agentSlot: z.string().min(1),
});

const VALID_PRIORITIES = [1, 2, 3, 4, 5] as const;
const PrioritySchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
	z.literal(5),
]);

const TaskStatusSchema = z.enum([
	'queued',
	'promoted',
	'consumed',
	'cancelled',
	'expired',
]);

const PersistentTaskEntrySchema = z.object({
	taskId: z.string().min(1),
	enqueuedAt: z.string().min(1),
	priority: PrioritySchema,
	waitFor: z.array(WaitForFileSchema),
	owner: TaskQueueOwnerSchema,
	observe: z.array(z.string()),
	status: TaskStatusSchema,
	promotedAt: z.string().optional(),
	consumedAt: z.string().optional(),
	cancelledAt: z.string().optional(),
	expiresAt: z.string().optional(),
});

const PersistentTaskQueueSchema = z.object({
	version: z.literal(1),
	entries: z.array(PersistentTaskEntrySchema),
});

// ---------------------------------------------------------------------------
// parseQueue
// ---------------------------------------------------------------------------

/**
 * Reads and validates a queue.json file.
 * Throws TaskQueueParseError on any validation failure.
 *
 * @param absolutePath  Absolute path to queue.json
 * @param closedTasksPath  Absolute path to closed-tasks.json (used to validate observe[])
 */
export const parseQueue = async (
	absolutePath: string,
	closedTasksPath: string,
	workspaceRoot?: string
): Promise<IPersistentTaskQueue> => {
	let raw: string;
	try {
		raw = await readFile(absolutePath, 'utf8');
	} catch (err) {
		throw new TaskQueueParseError(
			'PARSE_ERROR',
			absolutePath,
			`Cannot read queue file: ${String(err)}`
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		// Broken JSON syntax = a torn/corrupt file. Preserve the bytes
		// (corrupt ≠ empty) before reporting, so they aren't overwritten
		// by the next persist. Schema/business validations below keep the
		// file intact — they signal bad content, not a corrupt file.
		const backup = await quarantineCorruptFile(absolutePath);
		throw new TaskQueueParseError(
			'PARSE_ERROR',
			absolutePath,
			`Cannot parse queue JSON; preserved at "${backup ?? '<rename failed>'}": ${String(err)}`
		);
	}

	const result = PersistentTaskQueueSchema.safeParse(parsed);
	if (!result.success) {
		const firstIssue = result.error.issues[0];
		const field = firstIssue?.path.join('.');

		// Priority errors
		if (
			firstIssue?.message.includes('priority') ||
			field?.includes('priority')
		) {
			throw new TaskQueueParseError(
				'INVALID_PRIORITY',
				absolutePath,
				`Invalid priority in queue at ${absolutePath}: ${result.error.message}`,
				'priority'
			);
		}

		throw new TaskQueueParseError(
			'INVALID_TASK_QUEUE',
			absolutePath,
			`Queue validation failed at ${absolutePath}: ${result.error.message}`,
			field
		);
	}

	const queue = result.data;

	// Check for priority violations (Zod union may pass 0/6 in some paths)
	for (const entry of queue.entries) {
		if (
			!VALID_PRIORITIES.includes(
				entry.priority as (typeof VALID_PRIORITIES)[number]
			)
		) {
			throw new TaskQueueParseError(
				'INVALID_PRIORITY',
				absolutePath,
				`Entry ${entry.taskId} has invalid priority ${String(entry.priority)}`,
				'priority'
			);
		}
	}

	// Check duplicate taskId
	const seenIds = new Set<string>();
	for (let i = 0; i < queue.entries.length; i++) {
		const entry = queue.entries[i]!;
		if (seenIds.has(entry.taskId)) {
			throw new TaskQueueParseError(
				'DUPLICATE_TASK_ID',
				absolutePath,
				`Duplicate taskId "${entry.taskId}" found at index ${i}`,
				'taskId'
			);
		}
		seenIds.add(entry.taskId);
	}

	// Check waitFor files exist on disk. Paths resolve against the injected
	// workspace root (when given) rather than the process cwd, so a host
	// launched from another directory does not abort on false misses.
	for (const entry of queue.entries) {
		for (const wf of entry.waitFor) {
			const target = workspaceRoot ? resolve(workspaceRoot, wf.file) : wf.file;
			try {
				await stat(target);
			} catch {
				throw new TaskQueueParseError(
					'WAIT_FOR_FILE_MISSING',
					absolutePath,
					`waitFor file "${wf.file}" in entry "${entry.taskId}" does not exist on disk`,
					'waitFor'
				);
			}
		}
	}

	// Load closedTasks to validate observe[]
	let closedTaskIds: Set<string> = new Set();
	try {
		const ctRaw = await readFile(closedTasksPath, 'utf8');
		const ctParsed = JSON.parse(ctRaw) as Array<{ taskId: string }>;
		if (Array.isArray(ctParsed)) {
			closedTaskIds = new Set(ctParsed.map((t) => t.taskId));
		}
	} catch {
		// defensive: if closedTasks not readable, treat as empty
	}

	for (const entry of queue.entries) {
		for (const observeTarget of entry.observe) {
			if (!closedTaskIds.has(observeTarget)) {
				throw new TaskQueueParseError(
					'OBSERVE_TARGET_UNKNOWN',
					absolutePath,
					`observe target "${observeTarget}" in entry "${entry.taskId}" is not in closedTasks`,
					'observe'
				);
			}
		}
	}

	// Check temporal inconsistencies
	const now = Date.now();
	for (const entry of queue.entries) {
		if (entry.status === 'expired' && entry.expiresAt) {
			const expiresAtMs = Date.parse(entry.expiresAt);
			if (!Number.isNaN(expiresAtMs) && expiresAtMs > now) {
				throw new TaskQueueParseError(
					'TEMPORAL_INCONSISTENCY',
					absolutePath,
					`Entry "${entry.taskId}" has status "expired" but expiresAt (${entry.expiresAt}) is in the future`,
					'expiresAt'
				);
			}
		}
	}

	return queue as IPersistentTaskQueue;
};

// ---------------------------------------------------------------------------
// persistQueue — atomic write via tmp + rename
// ---------------------------------------------------------------------------

export const persistQueue = async (
	queue: IPersistentTaskQueue,
	absolutePath: string
): Promise<void> => {
	// Atomic write with the temp IN THE SAME DIRECTORY (never os.tmpdir),
	// so `rename` can't fail with EXDEV across filesystems.
	await writeFileAtomic(absolutePath, JSON.stringify(queue, null, 2));
};

// ---------------------------------------------------------------------------
// enqueue — adds entry sorted by priority desc + enqueuedAt asc
// ---------------------------------------------------------------------------

const DEFAULT_TTL_DAYS = 14;

export const enqueue = (
	queue: IPersistentTaskQueue,
	entry: IPersistentTaskEntry
): IPersistentTaskQueue => {
	// Compute default expiresAt if not set
	const entryWithExpiry: IPersistentTaskEntry = entry.expiresAt
		? entry
		: {
				...entry,
				expiresAt: (() => {
					const d = new Date(entry.enqueuedAt);
					d.setDate(d.getDate() + DEFAULT_TTL_DAYS);
					return d.toISOString();
				})(),
			};

	const entries = [...queue.entries, entryWithExpiry];

	// Sort: priority desc, then enqueuedAt asc
	entries.sort((a, b) => {
		if (b.priority !== a.priority) return b.priority - a.priority;
		return Date.parse(a.enqueuedAt) - Date.parse(b.enqueuedAt);
	});

	return { ...queue, entries };
};

// ---------------------------------------------------------------------------
// dequeue — mutates entry to consumed
// ---------------------------------------------------------------------------

export const dequeue = async (
	queue: IPersistentTaskQueue,
	taskId: string,
	queuePath: string
): Promise<{ queue: IPersistentTaskQueue; entry: IPersistentTaskEntry }> => {
	const idx = queue.entries.findIndex((e) => e.taskId === taskId);
	if (idx === -1) {
		throw new TaskQueueParseError(
			'TASK_NOT_FOUND',
			queuePath,
			`Task "${taskId}" not found in queue`,
			'taskId'
		);
	}

	const updated: IPersistentTaskEntry = {
		...queue.entries[idx]!,
		status: 'consumed',
		consumedAt: new Date().toISOString(),
	};

	const entries = [...queue.entries];
	entries[idx] = updated;
	const updatedQueue: IPersistentTaskQueue = { ...queue, entries };

	await persistQueue(updatedQueue, queuePath);

	return { queue: updatedQueue, entry: updated };
};

// ---------------------------------------------------------------------------
// promote — promotes queued entry when no lock conflict
// ---------------------------------------------------------------------------

type IPromoteResult =
	| {
			promoted: true;
			entry: IPersistentTaskEntry;
			queue: IPersistentTaskQueue;
	  }
	| {
			promoted: false;
			blockedBy: Array<{ file: string; blockingTaskId: string | null }>;
	  };

export const promote = async (
	queue: IPersistentTaskQueue,
	taskId: string,
	lockSnapshot: ILockSnapshot,
	queuePath: string
): Promise<IPromoteResult> => {
	const idx = queue.entries.findIndex((e) => e.taskId === taskId);
	if (idx === -1) {
		throw new TaskQueueParseError(
			'TASK_NOT_FOUND',
			queuePath,
			`Task "${taskId}" not found in queue`,
			'taskId'
		);
	}

	const entry = queue.entries[idx]!;

	// Check if any waitFor file is in the lock's in_flight
	const inFlightFiles = new Set(
		lockSnapshot.in_flight.flatMap((lockEntry) => lockEntry.ownership)
	);

	const blockedBy: Array<{ file: string; blockingTaskId: string | null }> =
		[];
	for (const wf of entry.waitFor) {
		if (inFlightFiles.has(wf.file)) {
			// find which task holds it
			const holder = lockSnapshot.in_flight.find((le) =>
				le.ownership.includes(wf.file)
			);
			blockedBy.push({
				file: wf.file,
				blockingTaskId: holder?.task_id ?? null,
			});
		}
	}

	if (blockedBy.length > 0) {
		return { promoted: false, blockedBy };
	}

	const promoted: IPersistentTaskEntry = {
		...entry,
		status: 'promoted',
		promotedAt: new Date().toISOString(),
	};

	const entries = [...queue.entries];
	entries[idx] = promoted;
	const updatedQueue: IPersistentTaskQueue = { ...queue, entries };

	await persistQueue(updatedQueue, queuePath);

	return { promoted: true, entry: promoted, queue: updatedQueue };
};

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

export const cancel = async (
	queue: IPersistentTaskQueue,
	taskId: string,
	_reason: string,
	queuePath: string
): Promise<{ queue: IPersistentTaskQueue; entry: IPersistentTaskEntry }> => {
	const idx = queue.entries.findIndex((e) => e.taskId === taskId);
	if (idx === -1) {
		throw new TaskQueueParseError(
			'TASK_NOT_FOUND',
			queuePath,
			`Task "${taskId}" not found in queue`,
			'taskId'
		);
	}

	const cancelled: IPersistentTaskEntry = {
		...queue.entries[idx]!,
		status: 'cancelled',
		cancelledAt: new Date().toISOString(),
	};

	const entries = [...queue.entries];
	entries[idx] = cancelled;
	const updatedQueue: IPersistentTaskQueue = { ...queue, entries };

	await persistQueue(updatedQueue, queuePath);

	return { queue: updatedQueue, entry: cancelled };
};

// ---------------------------------------------------------------------------
// expireSweep
// ---------------------------------------------------------------------------

export const expireSweep = async (
	queue: IPersistentTaskQueue,
	now: string,
	queuePath: string
): Promise<{ queue: IPersistentTaskQueue; expiredCount: number }> => {
	const nowMs = Date.parse(now);
	let expiredCount = 0;

	const entries = queue.entries.map((entry): IPersistentTaskEntry => {
		if (
			entry.status === 'queued' &&
			entry.expiresAt &&
			Date.parse(entry.expiresAt) < nowMs
		) {
			expiredCount++;
			return { ...entry, status: 'expired' };
		}
		return entry;
	});

	const updatedQueue: IPersistentTaskQueue = { ...queue, entries };

	await persistQueue(updatedQueue, queuePath);

	return { queue: updatedQueue, expiredCount };
};

// ---------------------------------------------------------------------------
// reportBackpressure
// ---------------------------------------------------------------------------

export const reportBackpressure = (
	queue: IPersistentTaskQueue,
	lockSnapshot: ILockSnapshot,
	now?: string
): IBackpressureReport => {
	const nowMs = now ? Date.parse(now) : Date.now();
	const queueLength = queue.entries.length;
	const queuedCount = queue.entries.filter(
		(e) => e.status === 'queued'
	).length;
	const promotedCount = queue.entries.filter(
		(e) => e.status === 'promoted'
	).length;
	const consumedCount = queue.entries.filter(
		(e) => e.status === 'consumed'
	).length;
	const cancelledCount = queue.entries.filter(
		(e) => e.status === 'cancelled'
	).length;
	const expiredCount = queue.entries.filter(
		(e) => e.status === 'expired'
	).length;

	// Oldest age in minutes (oldest queued entry)
	const queuedEntries = queue.entries.filter((e) => e.status === 'queued');
	let oldestAgeMinutes = 0;
	if (queuedEntries.length > 0) {
		const oldest = queuedEntries.reduce((acc, e) =>
			Date.parse(e.enqueuedAt) < Date.parse(acc.enqueuedAt) ? e : acc
		);
		oldestAgeMinutes = Math.floor(
			(nowMs - Date.parse(oldest.enqueuedAt)) / 60_000
		);
	}

	// Waiter orphans: queued entries whose waitFor.releasedBy is not in
	// lockSnapshot.in_flight and not in recentReleases (i.e., the task that
	// was supposed to release the file is gone)
	const inFlightTaskIds = new Set(
		lockSnapshot.in_flight.map((le) => le.task_id)
	);
	const recentReleasedTaskIds = new Set(
		lockSnapshot.recentReleases.map((r) => r.taskId)
	);
	const waiterOrphans = queuedEntries.filter((entry) => {
		return entry.waitFor.some(
			(wf) =>
				wf.releasedBy !== null &&
				!inFlightTaskIds.has(wf.releasedBy) &&
				!recentReleasedTaskIds.has(wf.releasedBy)
		);
	}).length;

	// Release signal backlog: queued entries whose waitFor files are all free
	// (not in any in_flight task)
	const inFlightFiles = new Set(
		lockSnapshot.in_flight.flatMap((le) => le.ownership)
	);
	const releaseSignalBacklog = queuedEntries.filter((entry) => {
		if (entry.waitFor.length === 0) return false;
		return entry.waitFor.every((wf) => !inFlightFiles.has(wf.file));
	}).length;

	// Threshold logic
	let threshold: IBackpressureThreshold = 'green';
	if (queueLength >= 16 || oldestAgeMinutes >= 240 || waiterOrphans >= 3) {
		threshold = 'red';
	} else if (
		queueLength >= 8 ||
		oldestAgeMinutes >= 120 ||
		waiterOrphans >= 1
	) {
		threshold = 'amber';
	}

	return {
		queueLength,
		queuedCount,
		promotedCount,
		consumedCount,
		cancelledCount,
		expiredCount,
		oldestAgeMinutes,
		waiterOrphans,
		releaseSignalBacklog,
		threshold,
	};
};

// ---------------------------------------------------------------------------
// subscribe
// ---------------------------------------------------------------------------

export const subscribe = (
	queue: IPersistentTaskQueue,
	taskId: string,
	closedTasks: Array<{
		taskId: string;
		closedAt: string;
		agentName: string;
		filesOwned: string[];
		diffSummary?: string;
	}>
): ISubscribeResult => {
	const entry = queue.entries.find((e) => e.taskId === taskId);
	if (!entry) {
		return { digests: [], pendingTargets: [] };
	}

	const closedMap = new Map(closedTasks.map((t) => [t.taskId, t]));
	const digests: IClosedTaskDigest[] = [];
	const pendingTargets: string[] = [];

	for (const observeTarget of entry.observe) {
		const closed = closedMap.get(observeTarget);
		if (closed) {
			digests.push({
				taskId: closed.taskId,
				closedAt: closed.closedAt,
				...(closed.diffSummary
					? { diffSummary: closed.diffSummary.slice(0, 4096) }
					: {}),
			});
		} else {
			pendingTargets.push(observeTarget);
		}
	}

	return { digests, pendingTargets };
};

// ---------------------------------------------------------------------------
// loadLockSnapshot — reads .cache/agents.lock.json + closedTasks.json
// ---------------------------------------------------------------------------

// Single canonical lock shape, matching exactly what `<prefix>_agent_lock`
// (agent-lock-engine) writes: `ownership` + `started_at` (+ optional
// `last_seen`/`parent_task_id`). The historical `files`/`claimed_at` shape is
// no longer accepted — M7 removed that compat layer.
const LockEntrySchema = z.object({
	task_id: z.string(),
	agent: z.string(),
	ownership: z.array(z.string()),
	started_at: z.string(),
	last_seen: z.string().optional(),
	parent_task_id: z.string().optional(),
});

const LockFileSchema = z.object({
	version: z.number(),
	stale_after_minutes: z.number().optional(),
	in_flight: z.array(LockEntrySchema),
});

const ClosedTaskEntrySchema = z.object({
	taskId: z.string(),
	closedAt: z.string(),
	agentName: z.string(),
	filesOwned: z.array(z.string()),
});

export const loadLockSnapshot = async (
	lockPath: string,
	closedTasksPath?: string
): Promise<ILockSnapshot> => {
	let in_flight: ILockEntry[] = [];

	try {
		const raw = await readFile(lockPath, 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		const result = LockFileSchema.safeParse(parsed);
		if (result.success) {
			in_flight = result.data.in_flight as ILockEntry[];
		}
	} catch {
		// lock not readable → empty
	}

	let recentReleases: ILockRelease[] = [];

	if (closedTasksPath) {
		try {
			const sixtySecondsAgo = Date.now() - 60_000;
			const raw = await readFile(closedTasksPath, 'utf8');
			const parsed = JSON.parse(raw) as unknown;
			if (Array.isArray(parsed)) {
				const validated = parsed
					.map((item) => ClosedTaskEntrySchema.safeParse(item))
					.filter((r) => r.success)
					.map(
						(r) =>
							(
								r as {
									success: true;
									data: z.infer<typeof ClosedTaskEntrySchema>;
								}
							).data
					);

				recentReleases = validated
					.filter((t) => Date.parse(t.closedAt) >= sixtySecondsAgo)
					.map((t) => ({
						taskId: t.taskId,
						releasedAt: t.closedAt,
						files: t.filesOwned,
					}));
			}
		} catch {
			// closedTasks not readable → empty
		}
	}

	return { in_flight, recentReleases };
};
