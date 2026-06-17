/**
 * task-queue-tool.ts
 *
 * <prefix>_task_queue — MCP tool with four actions: enqueue, dequeue, subscribe, report.
 * 
 *
 * This module exposes `runTaskQueueAction` (a pure function) and the
 * MCP-registration helper. The tool is registered in T3 (reserved: server.ts).
 *
 * Depends on:
 *   - persistent-task-queue.ts (T1 helpers)
 *   - closed-tasks-log.ts (T1 readClosedTasks)
 *   - Zod for input validation
 *
 * Validation contract:
 *   - All inputs are validated with Zod. On validation failure, the underlying
 *     ZodError is thrown unchanged so callers can introspect `error.issues`.
 *   - The action enum is also Zod-validated; an unknown action throws
 *     TaskQueueActionError (NOT ZodError) so the MCP layer can render a
 *     friendly message.
 */

import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import { quarantineCorruptFile, withFileMutex } from '@cartago-git/mcp-core/public';

import {
	enqueue,
	loadLockSnapshot,
	persistQueue,
	reportBackpressure,
} from './persistent-task-queue';
import type {
	IBackpressureReport,
	IClosedTaskDigest,
	IPersistentTaskEntry,
	IPersistentTaskQueue,
} from './persistent-task-queue';
import { readClosedTasks } from './closed-tasks-log';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TaskQueueActionError extends Error {
	readonly action: string;
	readonly reason: string;

	constructor(action: string, reason: string) {
		super(reason);
		this.name = 'TaskQueueActionError';
		this.action = action;
		this.reason = reason;
	}
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

// Agent slots are project-agnostic: any non-empty role name is accepted so
// external swarms can define their own roles. The canonical 5-role set lives
// in `persistent-task-queue` as `DEFAULT_AGENT_SLOTS` (a documented default,
// not an enforced enum).
const IAgentSlotSchema = z.string().min(1);

const IWaitForFileSchema = z.object({
	file: z.string().min(1),
	releasedBy: z.string().nullable(),
});

const IEnqueueParamsSchema = z.object({
	taskId: z.string().min(1),
	priority: z
		.union([
			z.literal(1),
			z.literal(2),
			z.literal(3),
			z.literal(4),
			z.literal(5),
		])
		.optional()
		.default(3),
	agentName: z.string().min(1),
	agentSlot: IAgentSlotSchema,
	waitFor: z.array(IWaitForFileSchema).optional().default([]),
	observe: z.array(z.string()).optional().default([]),
});

const IDequeueParamsSchema = z.object({
	taskId: z.string().min(1),
});

const ISubscribeParamsSchema = z.object({
	taskId: z.string().min(1),
	since: z.string().optional(),
});

const IReportParamsSchema = z.object({}).strict();

// The MCP input schema is permissive at the params level; each action
// validates its own params inside `runTaskQueueAction`. This keeps the
// tool contract flexible (callers don't need to remember the full
// discriminated union shape) while still throwing ZodError for invalid
// params inside the action handler.
export const IParamsSchema = z
	.record(z.string(), z.unknown())
	.optional()
	.default({});

export const IActionSchema = z.enum([
	'enqueue',
	'dequeue',
	'subscribe',
	'report',
]);

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export interface ITaskQueuePaths {
	readonly queuePath: string;
	readonly closedTasksPath: string;
	/** Absolute lock path (required) — read by the `report` action. */
	readonly lockPath: string;
	/** Absolute workspace root. `waitFor.file` paths resolve against this,
	 * not the process cwd, so a host launched from another directory never
	 * gets a false WAIT_FOR_FILE_MISSING. */
	readonly workspaceRoot: string;
}

// The action param interfaces use the Zod *input* type so that optional
// fields with defaults (priority, waitFor, observe) stay optional at
// the type level. The internal handler validates with the schema's
// *output* type after applying defaults.
type IEnqueueParamsInput = z.input<typeof IEnqueueParamsSchema>;
type IDequeueParamsInput = z.input<typeof IDequeueParamsSchema>;
type ISubscribeParamsInput = z.input<typeof ISubscribeParamsSchema>;

export interface IEnqueueAction {
	readonly action: 'enqueue';
	readonly params: IEnqueueParamsInput;
}

export interface IDequeueAction {
	readonly action: 'dequeue';
	readonly params: IDequeueParamsInput;
}

export interface ISubscribeAction {
	readonly action: 'subscribe';
	readonly params: ISubscribeParamsInput;
}

export interface IReportAction {
	readonly action: 'report';
	readonly params: Record<string, never>;
}

export type ITaskQueueAction =
	| IEnqueueAction
	| IDequeueAction
	| ISubscribeAction
	| IReportAction;

export interface IEnqueueResult {
	readonly taskId: string;
	readonly status: 'queued';
	readonly queueLength: number;
	readonly position: number;
}

export interface IDequeueDigestPayload {
	readonly digests: IClosedTaskDigest[];
}

export interface IDequeueResult {
	readonly taskId: string;
	readonly status: 'consumed';
	readonly consumedAt: string;
	readonly digest?: IDequeueDigestPayload;
}

export interface ISubscribeActionResult {
	readonly digests: IClosedTaskDigest[];
	readonly pendingTargets: string[];
}

export interface IReportResult extends IBackpressureReport {
	readonly recommendation: string;
}

export type ITaskQueueResult =
	| IEnqueueResult
	| IDequeueResult
	| ISubscribeActionResult
	| IReportResult;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Make sure the queue file exists. If not, create an empty one
 * (atomic write via persistQueue).
 */
const ensureQueueFile = async (queuePath: string): Promise<void> => {
	if (existsSync(queuePath)) return;
	await mkdir(dirname(queuePath), { recursive: true });
	const empty: IPersistentTaskQueue = { version: 1, entries: [] };
	await persistQueue(empty, queuePath);
};

/**
 * Internal: load the queue. Missing/empty → empty queue.
 * Corrupt JSON → rename to .corrupt-<ts> backup and throw.
 */
const loadOrEmptyQueue = async (
	queuePath: string
): Promise<IPersistentTaskQueue> => {
	if (!existsSync(queuePath)) return { version: 1, entries: [] };
	let raw: string;
	try {
		raw = await readFile(queuePath, 'utf8');
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: [] };
		throw err;
	}
	if (!raw.trim()) return { version: 1, entries: [] };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const backup = await quarantineCorruptFile(queuePath);
		throw new TaskQueueActionError(
			'load',
			`Queue file at "${queuePath}" has corrupt JSON; preserved at "${backup ?? '<rename failed>'}": ${String(err)}`
		);
	}
	const p = parsed as { version?: number; entries?: unknown[] };
	if (!p || !Array.isArray(p.entries)) {
		const backup = await quarantineCorruptFile(queuePath);
		throw new TaskQueueActionError(
			'load',
			`Queue file at "${queuePath}" has invalid schema; preserved at "${backup ?? '<rename failed>'}".`
		);
	}
	return parsed as IPersistentTaskQueue;
};

const computePosition = (
	queue: IPersistentTaskQueue,
	taskId: string
): number => {
	const idx = queue.entries.findIndex((e) => e.taskId === taskId);
	return idx === -1 ? -1 : idx;
};

// ---------------------------------------------------------------------------
// Recommendation logic
// ---------------------------------------------------------------------------

const buildRecommendation = (report: IBackpressureReport): string => {
	if (report.threshold === 'red') {
		const parts: string[] = [];
		if (report.queueLength >= 16)
			parts.push(`${report.queueLength} queued entries`);
		if (report.oldestAgeMinutes >= 240)
			parts.push(`oldest age ${report.oldestAgeMinutes}min`);
		if (report.waiterOrphans >= 3)
			parts.push(`${report.waiterOrphans} orphaned waiters`);
		return `red threshold: ${parts.join(', ')}; consider cancelling stale entries or escalating to user`;
	}
	if (report.threshold === 'amber') {
		const parts: string[] = [];
		if (report.queueLength >= 8)
			parts.push(`${report.queueLength} queued entries`);
		if (report.oldestAgeMinutes >= 120)
			parts.push(`oldest age ${report.oldestAgeMinutes}min`);
		if (report.waiterOrphans >= 1)
			parts.push(`${report.waiterOrphans} orphaned waiter(s)`);
		return `amber threshold: ${parts.join(', ')}; monitor and consider promoting waiters`;
	}
	return 'green threshold: queue is healthy';
};

// ---------------------------------------------------------------------------
// Idempotency tracking (in-memory only — not persisted across sessions)
// ---------------------------------------------------------------------------
// We track which (taskId, observedTaskId) pairs have been delivered
// in the current process. The spec requires `subscribe` to be idempotent
// within a session: the second call with the same taskId does not
// duplicate the digests.
//
// Cross-session idempotency is out of scope for T2: a process restart
// re-delivers the digests once. The proposal marks this as a follow-up
// for a future task-graph-validator where the digests would be stored
// in a side-file keyed by the observer taskId.
const deliveredDigests = new Set<string>();

const deliveredKey = (taskId: string, observedTaskId: string): string =>
	`${taskId}::${observedTaskId}`;

/**
 * Test-only: reset the in-memory idempotency tracker. Specs that
 * exercise the idempotency contract in isolation MUST call this in
 * their setup hook. Production code does not need to call it.
 *
 * Exported with the `__` prefix to flag it as a test escape hatch.
 */
export const __resetDeliveredDigestsForTesting = (): void => {
	deliveredDigests.clear();
};

// ---------------------------------------------------------------------------
// runTaskQueueAction — pure function
// ---------------------------------------------------------------------------

export async function runTaskQueueAction(
	action: ITaskQueueAction,
	paths: ITaskQueuePaths
): Promise<ITaskQueueResult> {
	// Validate action with Zod (defense-in-depth; callers normally pre-validate)
	const actionParse = IActionSchema.safeParse(action.action);
	if (!actionParse.success) {
		throw new TaskQueueActionError(
			String(action.action),
			`Unknown action: ${String(action.action)}; valid actions are: enqueue, dequeue, subscribe, report`
		);
	}

	if (action.action === 'enqueue') {
		// The enqueue schema is extended with two .superRefine blocks that
		// turn "waitFor file does not exist" and "observe target not closed"
		// into ZodError issues (so the MCP layer returns them as proper
		// validation errors). Priority itself is constrained by the
		// schema's union of literal 1-5, so `priority: 6` fails the
		// base schema with a ZodError before the refines even run.
		const IEnqueueWithFileCheck = IEnqueueParamsSchema.superRefine(
			(value, ctx) => {
				for (const wf of value.waitFor ?? []) {
					if (!existsSync(wf.file)) {
						ctx.addIssue({
							code: 'custom',
							path: ['waitFor'],
							message: `waitFor file "${wf.file}" does not exist on disk`,
						});
					}
				}
			}
		).superRefine((value, ctx) => {
			if (!value.observe || value.observe.length === 0) return;
			let closedTaskIds: Set<string> = new Set();
			try {
				const raw = readFileSync(paths.closedTasksPath, 'utf8');
				const parsed = JSON.parse(raw) as unknown;
				if (Array.isArray(parsed)) {
					closedTaskIds = new Set(
						(parsed as Array<{ taskId?: string }>)
							.map((t) => t.taskId)
							.filter(
								(id): id is string => typeof id === 'string'
							)
					);
				}
			} catch {
				closedTaskIds = new Set();
			}
			for (const target of value.observe) {
				if (!closedTaskIds.has(target)) {
					ctx.addIssue({
						code: 'custom',
						path: ['observe'],
						message: `observe target "${target}" is not in closedTasks.json`,
					});
				}
			}
		});

		const finalParams = IEnqueueWithFileCheck.parse(action.params);

		// Serialize the read → mutate → write across processes.
		return withFileMutex(paths.queuePath, async () => {
			await ensureQueueFile(paths.queuePath);

			const queue = await loadOrEmptyQueue(paths.queuePath);
			const newEntry: IPersistentTaskEntry = {
				taskId: finalParams.taskId,
				enqueuedAt: new Date().toISOString(),
				priority: finalParams.priority,
				waitFor: finalParams.waitFor,
				owner: {
					taskId: finalParams.taskId,
					agentName: finalParams.agentName,
					agentSlot: finalParams.agentSlot,
				},
				observe: finalParams.observe,
				status: 'queued',
			};

			const updated = enqueue(queue, newEntry);
			await persistQueue(updated, paths.queuePath);

			return {
				taskId: finalParams.taskId,
				status: 'queued',
				queueLength: updated.entries.length,
				position: computePosition(updated, finalParams.taskId),
			};
		});
	}

	if (action.action === 'dequeue') {
		const params = IDequeueParamsSchema.parse(action.params);

		// Serialize the read → mutate → write across processes.
		return withFileMutex(paths.queuePath, async () => {
			await ensureQueueFile(paths.queuePath);
			const queue = await loadOrEmptyQueue(paths.queuePath);

			const idx = queue.entries.findIndex((e) => e.taskId === params.taskId);
			if (idx === -1) {
				throw new TaskQueueActionError(
					'dequeue',
					`task "${params.taskId}" not found in queue`
				);
			}

			const entry = queue.entries[idx]!;
			const consumedAt = new Date().toISOString();
			const updated: IPersistentTaskEntry = {
				...entry,
				status: 'consumed',
				consumedAt,
			};
			const entries = [...queue.entries];
			entries[idx] = updated;
			await persistQueue({ ...queue, entries }, paths.queuePath);

			// If observe is non-empty, populate digest from closedTasks.json
			let digest: IDequeueDigestPayload | undefined;
			if (entry.observe && entry.observe.length > 0) {
				const closed = await readClosedTasks(paths.closedTasksPath);
				const closedMap = new Map(closed.map((c) => [c.taskId, c]));
				const digests: IClosedTaskDigest[] = [];
				for (const target of entry.observe) {
					const c = closedMap.get(target);
					if (c) {
						digests.push({
							taskId: c.taskId,
							closedAt: c.closedAt,
							...(c.filesOwned && c.filesOwned.length > 0
								? {
										diffSummary: `Files: ${c.filesOwned.join(', ')}`,
									}
								: {}),
						});
					}
				}
				digest = { digests };
			}

			return {
				taskId: params.taskId,
				status: 'consumed',
				consumedAt,
				...(digest ? { digest } : {}),
			};
		});
	}

	if (action.action === 'subscribe') {
		const params = ISubscribeParamsSchema.parse(action.params);

		await ensureQueueFile(paths.queuePath);
		const queue = await loadOrEmptyQueue(paths.queuePath);
		const closed = await readClosedTasks(paths.closedTasksPath);
		const closedMap = new Map(closed.map((c) => [c.taskId, c]));

		const entry = queue.entries.find((e) => e.taskId === params.taskId);
		const digests: IClosedTaskDigest[] = [];
		const pendingTargets: string[] = [];
		const observeTargets = entry?.observe ?? [];

		for (const target of observeTargets) {
			if (deliveredDigests.has(deliveredKey(params.taskId, target))) {
				// Already delivered in this session — skip
				continue;
			}
			const c = closedMap.get(target);
			if (c) {
				digests.push({
					taskId: c.taskId,
					closedAt: c.closedAt,
					...(c.filesOwned && c.filesOwned.length > 0
						? { diffSummary: `Files: ${c.filesOwned.join(', ')}` }
						: {}),
				});
				deliveredDigests.add(deliveredKey(params.taskId, target));
			} else {
				pendingTargets.push(target);
			}
		}

		return { digests, pendingTargets };
	}

	if (action.action === 'report') {
		IReportParamsSchema.parse(action.params ?? {});

		await ensureQueueFile(paths.queuePath);
		const queue = await loadOrEmptyQueue(paths.queuePath);
		const lock = await loadLockSnapshot(
			paths.lockPath ?? DEFAULT_PATH_LAYOUT.lockFile,
			paths.closedTasksPath
		);
		const baseReport = reportBackpressure(queue, lock);
		const recommendation = buildRecommendation(baseReport);

		return {
			...baseReport,
			recommendation,
		};
	}

	// Should never reach here
	throw new TaskQueueActionError(
		'unknown',
		`Unreachable: action ${String((action as { action: unknown }).action)} fell through`
	);
}

// ---------------------------------------------------------------------------
// MCP tool registration helper
// ---------------------------------------------------------------------------

// MCP tool response shape — must include `_meta?` (open index signature)
// because the @modelcontextprotocol SDK signature is `{ [x: string]: unknown; content: ...; _meta?: ... }`.
export interface IRunTaskQueueResponse {
	readonly content: Array<{ type: 'text'; text: string }>;
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}

export interface ITaskQueueMcpArgs {
	readonly action: unknown;
	readonly params?: unknown;
}

export async function runTaskQueueMcp(
	args: ITaskQueueMcpArgs,
	paths: ITaskQueuePaths
): Promise<IRunTaskQueueResponse> {
	try {
		const result = await runTaskQueueAction(
			args as ITaskQueueAction,
			paths
		);
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(result),
				},
			],
			// MCP modern structuredContent mirror of the text payload.
			structuredContent: result as unknown as Record<string, unknown>,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const envelope = { error: message };
		return {
			isError: true,
			content: [
				{
					type: 'text',
					text: JSON.stringify(envelope),
				},
			],
			structuredContent: envelope,
		};
	}
}
