import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import { PROJECT_HEALTH_DOMAINS } from '../contracts/interfaces/project-health.interface';
import type {
	IProjectHealthToolArgs,
	IProjectHealthToolOptions,
} from '../contracts/interfaces/project-health.interface';
import { buildProjectHealthPayload } from '../services/project-health.service';

const InputSchema = z.object({
	domain: z.enum(PROJECT_HEALTH_DOMAINS).optional(),
});

const NextActionSchema = z.object({
	tool: z.string(),
	reason: z.string(),
});

export const ProjectHealthOutputSchema = z.object({
	score: z.number().int().min(0).max(100).optional(),
	security: z.number().int().min(0).max(100).optional(),
	deps: z.number().int().min(0).max(100).optional(),
	quality: z.number().int().min(0).max(100).optional(),
	debt: z.number().int().min(0).max(100).optional(),
	next: z.array(NextActionSchema).optional(),
	domain: z.enum(PROJECT_HEALTH_DOMAINS).optional(),
	tool: z.string().optional(),
	hint: z.string().optional(),
	dependsOn: z.array(z.string()).optional(),
	bytes: z.number(),
	truncated: z.boolean(),
	originalBytes: z.number().optional(),
});

export const runProjectHealth = async (
	args: IProjectHealthToolArgs,
	options: IProjectHealthToolOptions,
) => {
	const parsed = InputSchema.safeParse(args);
	if (!parsed.success) {
		return toolError(
			parsed.error.message,
			'Pass domain=summary|security|deps|quality|debt.',
		);
	}
	return toolJson(await buildProjectHealthPayload(parsed.data, options));
};

export const buildProjectHealthToolRegistrations = (
	options: IProjectHealthToolOptions,
): IToolRegistration[] => [
	{
		id: 'project_health',
		tags: ['health', 'aggregation', 'compact'],
		summary:
			'Cheap project-health summary plus lazy routing to the real security, deps, quality and debt tools.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_project_health`,
				{
					outputSchema: ProjectHealthOutputSchema,
					description:
						'Aggregate a cheap project-health summary across security, deps, quality and debt. Summary mode is intentionally heuristic-only; detail modes stay lazy and point at the real domain tools without executing them.',
					inputSchema: InputSchema,
				},
				async (args) => runProjectHealth(args, options),
			);
		},
	},
];
