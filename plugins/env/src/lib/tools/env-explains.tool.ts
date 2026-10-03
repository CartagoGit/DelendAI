/**
 * env-explains.tool.ts — f00135 S2: `env_explains`
 *
 * For a given `.env` file, report which plugin capabilities are
 * unlocked (their required env vars are present) and which are
 * blocked (one or more required env vars are missing or empty).
 * Pure over the parsed env + injected requirements catalog.
 *
 * The catalog is plugin-supplied because the env plugin does not
 * own the other plugins' schemas. The host wires the requirements
 * in at register-time (or accepts the default empty catalog for
 * standalone use).
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import type { IEnvCheckToolOptions } from '../contracts/interfaces/env.interface';
import { parseEnv } from '../env/check-env';
import { realEnvDeps } from '../env/real-deps';
import { explain } from '../requirements/explain';
import type { IEnvRequirement } from '../requirements/types';

export interface IEnvExplainsToolOptions extends IEnvCheckToolOptions {
	/**
	 * Catalog of env-var requirements, typically built by walking the
	 * loaded plugins' `optionsSchema` for `.describe()` markers. Defaults
	 * to an empty array, in which case the tool reports an empty
	 * explainer (still useful as a structural smoke test).
	 */
	readonly requirements?: readonly IEnvRequirement[];
}

const _REQUIREMENT = z.object({
	var: z.string(),
	plugin: z.string(),
	capability: z.string(),
	provider: z.string().optional(),
	required: z.boolean(),
});

const EXPLAIN = z.object({
	capabilities: z.array(
		z.union([
			z.object({
				plugin: z.string(),
				capability: z.string(),
				provider: z.string().optional(),
				satisfiedBy: z.array(z.string()),
			}),
			z.object({
				plugin: z.string(),
				capability: z.string(),
				provider: z.string().optional(),
				missing: z.array(z.string()),
			}),
		]),
	),
	blocked: z.array(
		z.object({
			plugin: z.string(),
			capability: z.string(),
			provider: z.string().optional(),
			missing: z.array(z.string()),
		}),
	),
	unlocked: z.array(
		z.object({
			plugin: z.string(),
			capability: z.string(),
			provider: z.string().optional(),
			satisfiedBy: z.array(z.string()),
		}),
	),
	completelyMissing: z.array(z.string()),
});

export const buildEnvExplainsRegistration = (
	options: IEnvExplainsToolOptions,
): IToolRegistration => ({
	id: 'env_explains',
	summary:
		'For a parsed .env, report which plugin capabilities are unlocked vs blocked by missing env vars. Pure over injected requirements catalog.',
	tags: ['env', 'config', 'capabilities'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_env_explains`,
			{
				description:
					'Diff a parsed .env file against a catalog of env-var requirements (var → plugin → capability → optional provider) and return which capabilities are unlocked, which are blocked by missing vars, and which vars are completely missing. Offline, read-only. The catalog is supplied by the host at register-time (typically by walking the loaded plugins\' optionsSchema for `.describe("env:VAR...")` markers).',
				inputSchema: z.object({
					path: z.string().optional(),
				}),
				outputSchema: z.object({
					found: z.boolean(),
					path: z.string(),
					explain: EXPLAIN,
				}),
			},
			async (args: { path?: string | undefined }) => {
				const path = args.path ?? '.env';
				const deps =
					options.deps ?? realEnvDeps(options.workspaceRootAbs);
				const content = await deps.readEnv(path);
				if (content === undefined) {
					return toolJson({
						found: false,
						path,
						explain: {
							capabilities: [],
							blocked: [],
							unlocked: [],
							completelyMissing: [],
						},
					});
				}
				const parsed = parseEnv(content);
				const result = explain(parsed, options.requirements ?? []);
				return toolJson({ found: true, path, explain: result });
			},
		);
	},
});
