/**
 * init-config-tool.ts — `<prefix>_init_config`, the server-side
 * self-init (f00117 S2).
 *
 * Any MCP client can bootstrap its own `mcp-vertex.config.json` with
 * one call — no CLI required. Dry-run by default (returns the derived
 * config + rationale, writes nothing); `write: true` persists it
 * atomically; an existing config is never clobbered unless the caller
 * passes `overwrite: true`.
 */
import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import { toolError, toolJson } from '../shared/tool-response';
import { writeFileAtomic } from '../shared/atomic-write';
import type { IFileReader } from './analyze-project';
import { analyzeProject } from './analyze-project';
import { deriveConfig } from './derive-config';

export interface IInitConfigToolDeps {
	readonly namespacePrefix: string;
	readonly workspace: IWorkspacePathProvider;
	readonly reader: IFileReader;
}

const CONFIG_FILENAME = 'mcp-vertex.config.json';

const OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	preset: z.enum(['lean', 'standard', 'minimal']).optional(),
	config: z.record(z.string(), z.unknown()).optional(),
	rationale: z.array(z.string()).optional(),
	wrote: z.boolean().optional(),
	path: z.string().optional(),
});

export const buildInitConfigToolRegistration = (
	deps: IInitConfigToolDeps,
): IToolRegistration => ({
	id: 'init_config',
	summary:
		'Derive (and optionally write) mcp-vertex.config.json from the live project — the self-init any MCP client can call.',
	tags: ['orientation', 'bootstrap'],
	register: async (server) => {
		server.registerTool(
			`${deps.namespacePrefix}_init_config`,
			{
				description:
					'Derive a recommended mcp-vertex.config.json from THIS project (language, monorepo shape, real top-level dirs) — the server-side self-init for hosts with no CLI available. Dry-run by default: returns {preset, config, rationale} without writing. Pass write:true to persist atomically; an existing config is refused unless overwrite:true is also passed.',
				inputSchema: z.object({
					write: z.boolean().optional(),
					overwrite: z.boolean().optional(),
				}),
				outputSchema: OUTPUT_SCHEMA,
			},
			async (args: {
				write?: boolean | undefined;
				overwrite?: boolean | undefined;
			}) => {
				const analysis = await analyzeProject(deps.reader);
				const topLevelDirs = await deps.reader.listDir('');
				const derived = deriveConfig(analysis, { topLevelDirs });

				if (args.write !== true) {
					return toolJson({
						ok: true,
						preset: derived.preset,
						config: derived.config,
						rationale: derived.rationale,
						wrote: false,
					});
				}

				const existing = await deps.reader.exists(CONFIG_FILENAME);
				if (existing && args.overwrite !== true) {
					return toolError(
						`${CONFIG_FILENAME} already exists`,
						'Pass overwrite:true to replace it, or edit it by hand.',
					);
				}

				const absPath = deps.workspace.resolve(CONFIG_FILENAME);
				await writeFileAtomic(
					absPath,
					`${JSON.stringify(derived.config, null, '\t')}\n`,
				);
				return toolJson({
					ok: true,
					preset: derived.preset,
					config: derived.config,
					rationale: derived.rationale,
					wrote: true,
					path: CONFIG_FILENAME,
				});
			},
		);
	},
});
