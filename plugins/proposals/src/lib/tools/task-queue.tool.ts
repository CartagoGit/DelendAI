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

/**
 * Swarm coordination queue: enqueue/dequeue/subscribe/report. Thin
 * adapter over the (tested) task-queue engine; the plugin injects the
 * resolved paths.
 */
export const buildTaskQueueRegistration = (
	options: ITaskQueueToolOptions
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
						outputSchema: z.object({}).catchall(z.unknown()),
				description:
					'Swarm coordination only: enqueue/dequeue/subscribe/report for waitFor, observe, or backpressure. Root orchestrator owns queue writes.',
				inputSchema: z.object({
					action: IActionSchema,
					params: IParamsSchema.optional().default({}),
				}),
			},
			async (args) => runTaskQueueMcp(args, options.paths)
		);
	},
});
