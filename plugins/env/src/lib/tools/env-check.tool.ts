/**
 * env-check.tool.ts — `env_check`: validate a `.env` file and return
 * normalized findings (duplicate/empty/malformed keys + missing required
 * vars). Composes the r00012 finding helpers; the reader is injectable, so
 * the tool is testable. Values are never included in the output.
 */
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	resolveWorkspaceContained,
	summarizeFindings,
	toolError,
	toolJson,
	worstSeverity,
} from '@mcp-vertex/core/public';

import type { IEnvCheckToolOptions } from '../contracts/interfaces/env.interface';
import { runEnvCheck, runEnvCheckWithSchema } from '../env/check-env';
import { realEnvDeps } from '../env/real-deps';
import { ENV_SCHEMA } from '../validate/env-schema';
import type { IEnvSchema } from '../validate/env-schema';

const FINDING = z.object({
	ruleId: z.string(),
	severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
	message: z.string(),
	fix: z.string().optional(),
	location: z
		.object({
			file: z.string(),
			line: z.number().optional(),
			endLine: z.number().optional(),
		})
		.optional(),
});

export const buildEnvCheckRegistration = (
	options: IEnvCheckToolOptions,
): IToolRegistration => ({
	id: 'env_check',
	summary:
		'Validate a .env file: duplicate/empty/malformed keys + missing required vars. Offline.',
	tags: ['env', 'config'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_env_check`,
			{
				description:
					'Validate a dotenv file and return normalized findings: duplicate keys (medium), empty values (low), malformed lines (low) and missing required variables (high). Pass `path` (default ".env") and an optional `required` list of variable names. Values are never included in the output. Offline, read-only.',
				inputSchema: z.object({
					path: z.string().optional(),
					required: z.array(z.string()).optional(),
					schema: ENV_SCHEMA.optional(),
				}),
				outputSchema: z.object({
					found: z.boolean(),
					path: z.string(),
					findings: z.array(FINDING),
					summary: z.object({
						critical: z.number(),
						high: z.number(),
						medium: z.number(),
						low: z.number(),
						info: z.number(),
					}),
					worst: z.string(),
				}),
			},
			async (args) => {
				const path = args.path ?? '.env';
				if (options.deps === undefined) {
					const contained = resolveWorkspaceContained(
						options.workspaceRootAbs,
						path,
					);
					if (!contained.ok) {
						return toolError(
							`path "${path}" is not allowed`,
							contained.reason ??
								'path must stay inside the workspace root.',
						);
					}
				}
				const deps =
					options.deps ?? realEnvDeps(options.workspaceRootAbs);
				const schema: IEnvSchema | undefined =
					args.schema === undefined
						? undefined
						: {
								vars: Object.fromEntries(
									Object.entries(args.schema.vars).map(
										([key, value]) => [
											key,
											{
												type: value.type,
												...(value.enum === undefined
													? {}
													: { enum: value.enum }),
												...(value.required === undefined
													? {}
													: {
															required:
																value.required,
														}),
												...(value.description ===
												undefined
													? {}
													: {
															description:
																value.description,
														}),
											},
										],
									),
								),
							};
				const { found, findings } =
					schema !== undefined
						? await runEnvCheckWithSchema(
								deps,
								path,
								args.required ?? [],
								schema,
							)
						: await runEnvCheck(deps, path, args.required ?? []);
				return toolJson({
					found,
					path,
					findings,
					summary: summarizeFindings(findings),
					worst: worstSeverity(findings) ?? 'none',
				});
			},
		);
	},
});
