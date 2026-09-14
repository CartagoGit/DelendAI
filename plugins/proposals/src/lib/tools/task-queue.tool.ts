import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';

import {
	IActionSchema,
	IParamsSchema,
	releaseSessionSubscriptions,
	runTaskQueueMcp,
} from '../agents/task-queue-engine';
import type { ITaskQueuePaths } from '../agents/task-queue-engine';

export interface ITaskQueueToolOptions {
	readonly namespacePrefix: string;
	/** Resolved absolute queue artefact paths. */
	readonly paths: ITaskQueuePaths;
}

const TASK_QUEUE_DIGEST_SCHEMA = z.object({
	taskId: z.string(),
	closedAt: z.string(),
	diffSummary: z.string().optional(),
});

export const TASK_QUEUE_OUTPUT_SCHEMA = z.object({
	error: z.string().optional(),
	taskId: z.string().optional(),
	status: z.string().optional(),
	queueLength: z.number().optional(),
	position: z.number().optional(),
	consumedAt: z.string().optional(),
	digest: z
		.object({
			digests: z.array(TASK_QUEUE_DIGEST_SCHEMA),
		})
		.optional(),
	digests: z.array(TASK_QUEUE_DIGEST_SCHEMA).optional(),
	pendingTargets: z.array(z.string()).optional(),
	subscriberId: z.string().optional(),
	subscriptionId: z.string().optional(),
	leaseUntil: z.string().optional(),
	renewed: z.boolean().optional(),
	blocked: z.boolean().optional(),
	blockerType: z.string().optional(),
	nextAction: z.string().optional(),
	queuedCount: z.number().optional(),
	promotedCount: z.number().optional(),
	consumedCount: z.number().optional(),
	cancelledCount: z.number().optional(),
	expiredCount: z.number().optional(),
	waiterOrphans: z.number().optional(),
	oldestAgeMinutes: z.number().optional(),
	releaseSignalBacklog: z.number().optional(),
	threshold: z.string().optional(),
	recommendation: z.string().optional(),
});

export const TASK_QUEUE_INPUT_SCHEMA = z.object({
	action: IActionSchema,
	params: IParamsSchema.optional().default({}),
});

/**
 * Swarm coordination queue: enqueue/dequeue/subscribe/report. Thin
 * adapter over the (tested) task-queue engine; the plugin injects the
 * resolved paths.
 */
export const buildTaskQueueRegistration = (
	options: ITaskQueueToolOptions,
): IToolRegistration => ({
	id: 'task_queue',
	effects: ['write'],
	summary:
		'Multi-agent coordination queue: enqueue/dequeue/subscribe/report (waitFor, observe, backpressure).',
	tags: ['coordination'],
	register: async (server) => {
		attachSessionCleanup(server, options.paths);
		server.registerTool(
			`${options.namespacePrefix}_task_queue`,
			{
				outputSchema: TASK_QUEUE_OUTPUT_SCHEMA,
				description:
					'Swarm coordination only: enqueue/dequeue/subscribe/report/release-session for waitFor, observe, or backpressure. Root orchestrator owns queue writes.',
				inputSchema: TASK_QUEUE_INPUT_SCHEMA,
			},
			async (args) => runTaskQueueMcp(args, options.paths),
		);
	},
});

/**
 * The low-level `Server` behind an `McpServer`, narrowed to the two
 * members this module has to touch. `onclose` is fired synchronously by
 * the SDK from inside `Server.close()`; `close()` is what a host awaits.
 */
type ICloseCapableServer = {
	readonly server?: {
		onclose?: (() => void) | undefined;
		close?: (() => Promise<void>) | undefined;
	};
};

/**
 * Marks a `Server` this module has already wrapped, so a second tool
 * registration on the same server (lazy activation re-registers) does
 * not stack a second onclose/close pair.
 */
const CLEANUP_ATTACHED = Symbol.for('delendai.proposals.task-queue.cleanup');

/**
 * Release this process's subscription leases when the session ends, and
 * make `close()` WAIT for that release.
 *
 * The SDK's `onclose` is a synchronous `() => void`, so the natural
 * shape — `void releaseSessionSubscriptions(paths).catch(…)` — starts a
 * `withFileMutex` round trip (create `<queueDir>/.subscribe-leases.json.mutex`,
 * rewrite the leases file, delete the sidecar) and returns immediately.
 * `Server.close()` then resolves with those writes still in flight.
 *
 * That is not a theoretical leak. Every e2e spec that assembles a real
 * server tears down as `await close()` followed by
 * `rmSync(workspace, { recursive: true })`, and a recursive removal
 * walking a directory into which a file is concurrently created fails
 * with `ENOTEMPTY: rmdir '<workspace>/.cache/delendai'`. Under parallel
 * CI load — where the release lands a few milliseconds later than it
 * does on an idle machine — that took out three specs on `develop` at
 * once (`outputschema.e2e`, `token-budget.e2e`), always with the same
 * error and never with a hint as to who was still writing.
 *
 * So the promise is retained and `close()` is wrapped to await it. The
 * cleanup still runs from `onclose` (that is when the session is known
 * to be over, and a host that never calls `close()` still gets its
 * leases released); `close()` merely stops resolving before it is done.
 * Awaiting a settled or absent promise costs a microtask.
 */
const attachSessionCleanup = (
	server: unknown,
	paths: ITaskQueuePaths,
): void => {
	const transportServer = (server as ICloseCapableServer).server;
	if (transportServer === undefined) return;
	const marker = transportServer as unknown as Record<symbol, unknown>;
	if (marker[CLEANUP_ATTACHED] === true) return;
	marker[CLEANUP_ATTACHED] = true;

	/** The in-flight (or settled) release started by `onclose`. */
	let releasing: Promise<void> | undefined;

	const previousOnClose = transportServer.onclose;
	transportServer.onclose = (): void => {
		releasing = releaseSessionSubscriptions(paths).then(
			() => undefined,
			() => undefined,
		);
		previousOnClose?.();
	};

	const previousClose = transportServer.close?.bind(transportServer);
	transportServer.close = async (): Promise<void> => {
		await previousClose?.();
		// `onclose` fires from INSIDE the transport close above, so by
		// this line `releasing` holds the promise it started.
		await releasing;
	};
};
