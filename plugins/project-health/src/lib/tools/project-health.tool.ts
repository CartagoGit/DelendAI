import z from 'zod';

import {
	DETAIL_LEVELS,
	projectDetail,
	toolError,
	toolJson,
	type Detail,
	type IToolRegistration,
} from '@delendai/core/public';

import { PROJECT_HEALTH_DOMAINS } from '../contracts/interfaces/project-health.interface';
import type {
	IProjectHealthOutput,
	IProjectHealthToolArgs,
	IProjectHealthToolOptions,
} from '../contracts/interfaces/project-health.interface';
import { buildProjectHealthPayload } from '../services/project-health.service';

const DetailSchema = z.enum(DETAIL_LEVELS);

const InputSchema = z.object({
	domain: z.enum(PROJECT_HEALTH_DOMAINS).optional(),
	detail: DetailSchema.optional(),
});

const NextActionSchema = z.object({
	tool: z.string(),
	reason: z.string(),
});

export const ProjectHealthOutputSchema = z.object({
	detail: DetailSchema.optional(),
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

type ProjectHealthPayload = Omit<IProjectHealthOutput, never>;

const projectProjectHealthPayload = (
	payload: ProjectHealthPayload,
	detail: Detail,
): ProjectHealthPayload =>
	projectDetail(
		payload,
		{
			compact: (full) =>
				full.domain === undefined
					? {
							score: full.score,
							security: full.security,
							deps: full.deps,
							quality: full.quality,
							debt: full.debt,
							bytes: full.bytes,
							truncated: full.truncated,
							...(full.originalBytes !== undefined
								? { originalBytes: full.originalBytes }
								: {}),
						}
					: {
							domain: full.domain,
							tool: full.tool,
							hint: full.hint,
							bytes: full.bytes,
							truncated: full.truncated,
							...(full.originalBytes !== undefined
								? { originalBytes: full.originalBytes }
								: {}),
						},
			normal: (full) => full,
			full: (full) => full,
		},
		detail,
	) as ProjectHealthPayload;

export const runProjectHealth = async (
	args: IProjectHealthToolArgs & { detail?: Detail | undefined },
	options: IProjectHealthToolOptions,
) => {
	const parsed = InputSchema.safeParse(args);
	if (!parsed.success) {
		return toolError(
			parsed.error.message,
			'Pass domain=summary|security|deps|quality|debt.',
		);
	}
	const payload = await buildProjectHealthPayload(
		{ domain: parsed.data.domain },
		options,
	);
	if (parsed.data.detail === undefined) {
		return toolJson(payload);
	}
	return toolJson({
		detail: parsed.data.detail,
		...projectProjectHealthPayload(payload, parsed.data.detail),
	});
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
						'Aggregate a cheap project-health summary across security, deps, quality and debt. Summary mode is intentionally heuristic-only; detail modes stay lazy and point at the real domain tools without executing them. When `detail` is omitted the tool preserves the legacy payload; `compact` trims routing metadata, while `normal` and `full` keep the same shape.',
					inputSchema: InputSchema,
				},
				async (args) => runProjectHealth(args, options),
			);
		},
	},
];
