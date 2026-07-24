/**
 * init-config-tool.ts — `<prefix>_init_config`, the server-side
 * self-init (f00117 S2).
 *
 * Any MCP client can bootstrap its own `mcp-vertex.config.json` with
 * one call — no CLI required. Dry-run by default (returns the derived
 * config + rationale, writes nothing); `write: true` persists it
 * atomically. A valid existing config is merged as the project authority;
 * only `overwrite: true` intentionally replaces it.
 */
import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import { toolError, toolJson } from '../shared/tool-response';
import { writeFileAtomic } from '../shared/atomic-write';
import type { IFileReader } from './analyze-project';
import { analyzeProject } from './analyze-project';
import { deriveConfig } from './derive-config';
import { mergeDerivedConfig } from './merge-derived-config';

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
					'Derive a recommended mcp-vertex.config.json from THIS project (language, monorepo shape, real top-level dirs) — the server-side self-init for hosts with no CLI available. Dry-run by default: returns {preset, config, rationale} without writing. Pass write:true to add missing setup atomically while preserving an existing valid project config; pass overwrite:true only to intentionally replace it.',
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

				const existingText =
					await deps.reader.readFile(CONFIG_FILENAME);
				let config = derived.config as Record<string, unknown>;
				if (existingText !== undefined && args.overwrite !== true) {
					let existing: unknown;
					try {
						existing = JSON.parse(existingText);
					} catch {
						return toolError(
							`${CONFIG_FILENAME} is not valid JSON`,
							'Fix the project configuration or pass overwrite:true to intentionally replace it.',
						);
					}
					if (
						existing === null ||
						typeof existing !== 'object' ||
						Array.isArray(existing)
					) {
						return toolError(
							`${CONFIG_FILENAME} must contain a JSON object`,
							'Fix the project configuration or pass overwrite:true to intentionally replace it.',
						);
					}
					config = mergeDerivedConfig(
						derived.config,
						existing as Record<string, unknown>,
					);
				}

				const absPath = deps.workspace.resolve(CONFIG_FILENAME);
				await writeFileAtomic(
					absPath,
					`${JSON.stringify(config, null, '\t')}\n`,
				);
				return toolJson({
					ok: true,
					preset: derived.preset,
					config,
					rationale: derived.rationale,
					wrote: true,
					path: CONFIG_FILENAME,
				});
			},
		);
	},
});
