/**
 * env-check.tool.ts — `env_check`: validate a `.env` file and return
 * normalized findings (duplicate/empty/malformed keys + missing required
 * vars). Composes the r00012 finding helpers; the reader is injectable, so
 * the tool is testable. Values are never included in the output.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	summarizeFindings,
	toolJson,
	worstSeverity,
} from '@mcp-vertex/core/public';

import type { IEnvCheckToolOptions } from '../contracts/interfaces/env.interface';
import { runEnvCheck } from '../env/check-env';
import { realEnvDeps } from '../env/real-deps';

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
			async (args: {
				path?: string | undefined;
				required?: string[] | undefined;
			}) => {
				const path = args.path ?? '.env';
				const deps =
					options.deps ?? realEnvDeps(options.workspaceRootAbs);
				const { found, findings } = await runEnvCheck(
					deps,
					path,
					args.required ?? [],
				);
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
