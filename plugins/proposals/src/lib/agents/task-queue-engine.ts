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

import { mkdir, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import z from 'zod';

import {
	quarantineCorruptFile,
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import {
	enqueue,
	loadLockSnapshot,
	persistQueue,
	persistQueueUnlocked,
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
	subscriberId: z.string().min(1).optional().default('anonymous'),
	subscriptionId: z.string().min(1).optional(),
	now: z.string().optional(),
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
	'release-session',
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

export interface IReleaseSessionAction {
	readonly action: 'release-session';
	readonly params: Record<string, never>;
}

export type ITaskQueueAction =
	| IEnqueueAction
	| IDequeueAction
	| ISubscribeAction
	| IReleaseSessionAction
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
	readonly subscriberId: string;
	readonly subscriptionId: string;
	readonly leaseUntil: string;
	readonly renewed: boolean;
}

export interface ISubscribeBlockedResult {
	readonly blocked: true;
	readonly blockerType: 'subscription-conflict';
	readonly subscriberId: string;
	readonly leaseUntil: string;
	readonly nextAction: string;
}

export interface IReportResult extends IBackpressureReport {
	readonly recommendation: string;
}

export type ITaskQueueResult =
	| IEnqueueResult
	| IDequeueResult
	| ISubscribeActionResult
	| ISubscribeBlockedResult
	| IReportResult;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Make sure the queue file exists. If not, create an empty one
 * (atomic write via persistQueue).
 */
const ensureQueueFile = async (queuePath: string): Promise<void> => {
	try {
		await stat(queuePath);
		return;
	} catch {
		// missing — create an empty queue below
	}
	await mkdir(dirname(queuePath), { recursive: true });
	const empty: IPersistentTaskQueue = { version: 1, entries: [] };
	await persistQueue(empty, queuePath);
};

/**
 * Internal: load the queue. Missing/empty → empty queue.
 * Corrupt JSON → rename to .corrupt-<ts> backup and throw.
 */
export const loadOrEmptyQueue = async (
	queuePath: string,
): Promise<IPersistentTaskQueue> => {
	let raw: string;
	try {
		raw = (
			await new SafeWorkspaceReader(dirname(queuePath)).readText(
				basename(queuePath),
			)
		).content;
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT')
			return { version: 1, entries: [] };
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
			`Queue file at "${queuePath}" has corrupt JSON; preserved at "${backup ?? '<rename failed>'}": ${String(err)}`,
		);
	}
	const p = parsed as { version?: number; entries?: unknown[] };
	if (!p || !Array.isArray(p.entries)) {
		const backup = await quarantineCorruptFile(queuePath);
		throw new TaskQueueActionError(
			'load',
			`Queue file at "${queuePath}" has invalid schema; preserved at "${backup ?? '<rename failed>'}".`,
		);
	}
	return parsed as IPersistentTaskQueue;
};

const computePosition = (
	queue: IPersistentTaskQueue,
	taskId: string,
): number => {
	const idx = queue.entries.findIndex((e) => e.taskId === taskId);
	return idx === -1 ? -1 : idx;
};

// ---------------------------------------------------------------------------
// Recommendation logic
// ---------------------------------------------------------------------------

const RED_QUEUE_LENGTH_THRESHOLD = 16;
const RED_OLDEST_AGE_MINUTES_THRESHOLD = 240;
const RED_WAITER_ORPHANS_THRESHOLD = 3;
const AMBER_QUEUE_LENGTH_THRESHOLD = 8;
const AMBER_OLDEST_AGE_MINUTES_THRESHOLD = 120;
const AMBER_WAITER_ORPHANS_THRESHOLD = 1;

const buildRecommendation = (report: IBackpressureReport): string => {
	if (report.threshold === 'red') {
		const parts: string[] = [];
		if (report.queueLength >= RED_QUEUE_LENGTH_THRESHOLD)
			parts.push(`${report.queueLength} queued entries`);
		if (report.oldestAgeMinutes >= RED_OLDEST_AGE_MINUTES_THRESHOLD)
			parts.push(`oldest age ${report.oldestAgeMinutes}min`);
		if (report.waiterOrphans >= RED_WAITER_ORPHANS_THRESHOLD)
			parts.push(`${report.waiterOrphans} orphaned waiters`);
		return `red threshold: ${parts.join(', ')}; consider cancelling stale entries or escalating to user`;
	}
	if (report.threshold === 'amber') {
		const parts: string[] = [];
		if (report.queueLength >= AMBER_QUEUE_LENGTH_THRESHOLD)
			parts.push(`${report.queueLength} queued entries`);
		if (report.oldestAgeMinutes >= AMBER_OLDEST_AGE_MINUTES_THRESHOLD)
			parts.push(`oldest age ${report.oldestAgeMinutes}min`);
		if (report.waiterOrphans >= AMBER_WAITER_ORPHANS_THRESHOLD)
			parts.push(`${report.waiterOrphans} orphaned waiter(s)`);
		return `amber threshold: ${parts.join(', ')}; monitor and consider promoting waiters`;
	}
	return 'green threshold: queue is healthy';
};

// ---------------------------------------------------------------------------
// Idempotency tracking (persisted — survives process restarts) — M6
// ---------------------------------------------------------------------------
// We track which (taskId, observedTaskId) pairs have already been delivered
// so `subscribe` is idempotent: a repeated call (within OR across sessions)
// never re-delivers the same digest. The set lives in a sidecar JSON next to
// the queue, mutated under `withFileMutex` so concurrent subscribers cannot
// lose updates. A process restart no longer re-delivers (the bug M6 fixes).

const deliveredKey = (taskId: string, observedTaskId: string): string =>
	`${taskId}::${observedTaskId}`;

/** Sidecar path for the delivered-digests set, derived from the queue path. */
const deliveredSidecarPath = (queuePath: string): string =>
	resolve(dirname(queuePath), '.subscribe-delivered.json');

const subscriptionSidecarPath = (queuePath: string): string =>
	resolve(dirname(queuePath), '.subscribe-leases.json');

const SUBSCRIPTION_LEASE_MS = 10 * 60_000;

interface ISubscriptionLease {
	taskId: string;
	subscriberId: string;
	subscriptionId: string;
	leaseUntil: string;
	host?: string;
	pid?: number;
}

const loadSubscriptionLeases = async (
	path: string,
): Promise<ISubscriptionLease[]> => {
	try {
		const raw = (
			await new SafeWorkspaceReader(dirname(path)).readText(
				basename(path),
			)
		).content;
		const parsed = JSON.parse(raw) as { leases?: unknown };
		return Array.isArray(parsed.leases)
			? parsed.leases.filter(
					(value): value is ISubscriptionLease =>
						typeof value === 'object' &&
						value !== null &&
						typeof (value as ISubscriptionLease).taskId ===
							'string' &&
						typeof (value as ISubscriptionLease).subscriberId ===
							'string' &&
						typeof (value as ISubscriptionLease).subscriptionId ===
							'string' &&
						typeof (value as ISubscriptionLease).leaseUntil ===
							'string',
				)
			: [];
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		return [];
	}
};

const saveSubscriptionLeases = async (
	path: string,
	leases: readonly ISubscriptionLease[],
): Promise<void> => {
	await mkdir(dirname(path), { recursive: true });
	await writeFileAtomic(path, `${JSON.stringify({ leases }, null, 2)}\n`);
};

/**
 * Load the persisted delivered-keys set. Missing/empty → empty set. Corrupt
 * JSON → quarantine + empty (defensive: idempotency is best-effort, never a
 * reason to fail a subscribe — at worst a stale digest re-delivers once).
 */
const loadDeliveredSet = async (sidecarPath: string): Promise<Set<string>> => {
	let raw: string;
	try {
		raw = (
			await new SafeWorkspaceReader(dirname(sidecarPath)).readText(
				basename(sidecarPath),
			)
		).content;
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
		throw err;
	}
	if (!raw.trim()) return new Set();
	try {
		const parsed = JSON.parse(raw) as { delivered?: unknown };
		if (Array.isArray(parsed.delivered)) {
			return new Set(
				parsed.delivered.filter(
					(k): k is string => typeof k === 'string',
				),
			);
		}
	} catch {
		await quarantineCorruptFile(sidecarPath);
	}
	return new Set();
};
/**
 * Resolve the current host/pid for session-aware ownership. The bridge in
 * `@mcp-vertex/proposals/src/index.ts` overrides this once per boot so every
 * process tracks its own identity without leaking into other hosts.
 */
export const resolveCallerSession = (): { host: string; pid: number } => {
	const override = callerSessionOverrideForTests();
	if (override !== undefined) return override;
	return resolveCallerSessionImpl();
};

const resolveCallerSessionImpl = (): { host: string; pid: number } => ({
	host: hostname(),
	pid: process.pid,
});

let callerSessionOverride:
	| (() => { host: string; pid: number } | undefined)
	| undefined;

export const callerSessionOverrideForTests = ():
	| { host: string; pid: number }
	| undefined => callerSessionOverride?.();

export const overrideCallerSessionForTests = (
	factory?: () => { host: string; pid: number } | undefined,
): void => {
	callerSessionOverride = factory;
};

/**
 * Release every subscription lease owned by the caller process.
 * Idempotent: a process that closed once is a no-op on the next call.
 * The host/pid match keeps one process from stealing another process's
 * lease; pre-tracking entries (no host/pid) are preserved for the legacy
 * TTL path.
 */
export async function releaseSessionSubscriptions(
	paths: ITaskQueuePaths,
	caller: { host: string; pid: number } = resolveCallerSession(),
): Promise<{ readonly releasedTaskIds: readonly string[] }> {
	const subscriptionPath = subscriptionSidecarPath(paths.queuePath);
	return withFileMutex(subscriptionPath, async () => {
		const leases = await loadSubscriptionLeases(subscriptionPath);
		const owned = leases.filter(
			(lease) =>
				typeof lease.host === 'string' &&
				lease.host === caller.host &&
				typeof lease.pid === 'number' &&
				lease.pid === caller.pid,
		);
		if (owned.length === 0) return { releasedTaskIds: [] };
		const released = new Set(owned.map((lease) => lease.taskId));
		await saveSubscriptionLeases(
			subscriptionPath,
			leases.filter((lease) => !released.has(lease.taskId)),
		);
		return { releasedTaskIds: [...released] };
	});
}

/** Atomically persist the delivered-keys set (kept readable on disk — N11). */
const saveDeliveredSet = async (
	sidecarPath: string,
	set: ReadonlySet<string>,
): Promise<void> => {
	await mkdir(dirname(sidecarPath), { recursive: true });
	await writeFileAtomic(
		sidecarPath,
		`${JSON.stringify({ delivered: [...set].sort() }, null, 2)}\n`,
	);
};

// ---------------------------------------------------------------------------
// runTaskQueueAction — pure function
// ---------------------------------------------------------------------------

export async function runTaskQueueAction(
	action: ITaskQueueAction,
	paths: ITaskQueuePaths,
): Promise<ITaskQueueResult> {
	// Validate action with Zod (defense-in-depth; callers normally pre-validate)
	const actionParse = IActionSchema.safeParse(action.action);
	if (!actionParse.success) {
		throw new TaskQueueActionError(
			String(action.action),
			`Unknown action: ${String(action.action)}; valid actions are: enqueue, dequeue, subscribe, report`,
		);
	}

	if (action.action === 'enqueue') {
		// The enqueue schema is extended with two .superRefine blocks that
		// turn "waitFor file does not exist" and "observe target not closed"
		// into ZodError issues (so the MCP layer returns them as proper
		// validation errors). Priority itself is constrained by the
		// schema's union of literal 1-5, so `priority: 6` fails the
		// base schema with a ZodError before the refines even run.
		// Resolve the disk-dependent facts ASYNCHRONOUSLY before validating,
		// so the (synchronous) Zod refine never blocks the event loop. Paths
		// resolve against the injected workspace root — not the process cwd —
		// so a host launched elsewhere does not see false missing files.
		const rawWaitFor =
			(action.params as { waitFor?: Array<{ file: string }> }).waitFor ??
			[];
		const missingWaitFor = new Set<string>();
		await Promise.all(
			rawWaitFor.map(async (wf) => {
				try {
					await stat(resolve(paths.workspaceRoot, wf.file));
				} catch {
					missingWaitFor.add(wf.file);
				}
			}),
		);
		let closedTaskIds = new Set<string>();
		try {
			const closed = await readClosedTasks(paths.closedTasksPath);
			closedTaskIds = new Set(closed.map((c) => c.taskId));
		} catch {
			// closedTasks unreadable/corrupt → treat as empty (defensive).
		}

		const IEnqueueWithFileCheck = IEnqueueParamsSchema.superRefine(
			(value, ctx) => {
				for (const wf of value.waitFor ?? []) {
					if (missingWaitFor.has(wf.file)) {
						ctx.addIssue({
							code: 'custom',
							path: ['waitFor'],
							message: `waitFor file "${wf.file}" does not exist on disk`,
						});
					}
				}
			},
		).superRefine((value, ctx) => {
			for (const target of value.observe ?? []) {
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
			await persistQueueUnlocked(updated, paths.queuePath);

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

			const idx = queue.entries.findIndex(
				(e) => e.taskId === params.taskId,
			);
			if (idx === -1) {
				throw new TaskQueueActionError(
					'dequeue',
					`task "${params.taskId}" not found in queue`,
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
			await persistQueueUnlocked({ ...queue, entries }, paths.queuePath);

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
		const now = params.now ? new Date(params.now) : new Date();
		const nowMs = now.getTime();
		if (Number.isNaN(nowMs))
			throw new TaskQueueActionError(
				'subscribe',
				'now must be an ISO date',
			);

		const subscriptionPath = subscriptionSidecarPath(paths.queuePath);
		return await withFileMutex(subscriptionPath, async () => {
			await ensureQueueFile(paths.queuePath);
			const queue = await loadOrEmptyQueue(paths.queuePath);
			const closed = await readClosedTasks(paths.closedTasksPath);
			const closedMap = new Map(closed.map((c) => [c.taskId, c]));
			const entry = queue.entries.find((e) => e.taskId === params.taskId);
			const observeTargets = entry?.observe ?? [];
			const leases = (
				await loadSubscriptionLeases(subscriptionPath)
			).filter((lease) => Date.parse(lease.leaseUntil) > nowMs);
			const current = leases.find(
				(lease) => lease.taskId === params.taskId,
			);
			if (
				current !== undefined &&
				(current.subscriberId !== params.subscriberId ||
					(params.subscriptionId !== undefined &&
						current.subscriptionId !== params.subscriptionId))
			) {
				return {
					blocked: true,
					blockerType: 'subscription-conflict',
					subscriberId: params.subscriberId,
					leaseUntil: current.leaseUntil,
					nextAction:
						'Wait for the subscription lease to expire, or reconnect with the owning subscriberId and subscriptionId.',
				};
			}
			const subscriptionId = current?.subscriptionId ?? randomUUID();
			const leaseUntil = new Date(
				nowMs + SUBSCRIPTION_LEASE_MS,
			).toISOString();
			const nextLease: ISubscriptionLease = {
				taskId: params.taskId,
				subscriberId: params.subscriberId,
				subscriptionId,
				leaseUntil,
				...resolveCallerSession(),
			};
			await saveSubscriptionLeases(subscriptionPath, [
				...leases.filter((lease) => lease.taskId !== params.taskId),
				nextLease,
			]);

			const sidecarPath = deliveredSidecarPath(paths.queuePath);
			return await withFileMutex(sidecarPath, async () => {
				const delivered = await loadDeliveredSet(sidecarPath);
				const digests: IClosedTaskDigest[] = [];
				const pendingTargets: string[] = [];
				let mutated = false;

				for (const target of observeTargets) {
					const key = deliveredKey(params.taskId, target);
					if (delivered.has(key)) {
						// Already delivered (this session or a previous one) — skip.
						continue;
					}
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
						delivered.add(key);
						mutated = true;
					} else {
						pendingTargets.push(target);
					}
				}

				if (mutated) await saveDeliveredSet(sidecarPath, delivered);
				return {
					digests,
					pendingTargets,
					subscriberId: params.subscriberId,
					subscriptionId,
					leaseUntil,
					renewed: current !== undefined,
				};
			});
		});
	}

	if (action.action === 'release-session') {
		const released = await releaseSessionSubscriptions(
			paths,
			resolveCallerSession(),
		);
		return {
			status: 'released-session',
			releasedTaskIds: released.releasedTaskIds,
		} as unknown as ITaskQueueResult;
	}

	if (action.action === 'report') {
		IReportParamsSchema.parse(action.params ?? {});

		await ensureQueueFile(paths.queuePath);
		const queue = await loadOrEmptyQueue(paths.queuePath);
		const lock = await loadLockSnapshot(
			paths.lockPath,
			paths.closedTasksPath,
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
		`Unreachable: action ${String((action as { action: unknown }).action)} fell through`,
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
	paths: ITaskQueuePaths,
): Promise<IRunTaskQueueResponse> {
	try {
		const result = await runTaskQueueAction(
			args as ITaskQueueAction,
			paths,
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
