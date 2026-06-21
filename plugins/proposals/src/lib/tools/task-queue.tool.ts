import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	IActionSchema,
	IParamsSchema,
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

const TASK_QUEUE_OUTPUT_SCHEMA = z.object({
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
		server.registerTool(
			`${options.namespacePrefix}_task_queue`,
			{
				outputSchema: TASK_QUEUE_OUTPUT_SCHEMA,
				description:
					'Swarm coordination only: enqueue/dequeue/subscribe/report for waitFor, observe, or backpressure. Root orchestrator owns queue writes.',
				inputSchema: z.object({
					action: IActionSchema,
					params: IParamsSchema.optional().default({}),
				}),
			},
			async (args) => runTaskQueueMcp(args, options.paths),
		);
	},
});
