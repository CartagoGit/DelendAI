import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

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

type ICloseCapableServer = {
	readonly server?: {
		onclose?: (() => void) | undefined;
	};
};

const attachSessionCleanup = (
	server: unknown,
	paths: ITaskQueuePaths,
): void => {
	const transportServer = (server as ICloseCapableServer).server;
	if (transportServer === undefined) return;
	const previousOnClose = transportServer.onclose;
	transportServer.onclose = (): void => {
		void releaseSessionSubscriptions(paths).catch(() => undefined);
		previousOnClose?.();
	};
};
