// the `<prefix>_scaffold` MCP tool: lets any agent in the host
// workspace generate new tools, prompts, skills, agent adapters or a
// complete host project. Dry-run by default; writes refuse to
// overwrite existing files (scaffolds are starting points, not
// migrations).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import {
	scaffoldAgentFile,
	scaffoldClientFiles,
	scaffoldHostProject,
	scaffoldPluginFiles,
	scaffoldPromptFile,
	scaffoldSkillFile,
	scaffoldToolFile,
} from './scaffold-host';
import type {
	IScaffoldAgentSlot,
	IScaffoldHostOptions,
	IScaffoldedFile,
} from './scaffold-host';

export interface IScaffoldToolOptions {
	readonly namespacePrefix: string;
	readonly workspace: IWorkspacePathProvider;
	readonly projectName: string;
	readonly serverPackageName: string;
	readonly defaultModel?: string;
}

export const SCAFFOLD_INPUT_SCHEMA = z.object({
	kind: z
		.enum(['tool', 'prompt', 'skill', 'agent', 'host', 'plugin', 'client'])
		.describe('What to generate.'),
	name: z
		.string()
		.optional()
		.describe('Artefact name (tool/prompt/skill), e.g. "render stats".'),
	description: z
		.string()
		.optional()
		.describe('One-line description for the artefact.'),
	slot: z
		.enum([
			'orchestrator',
			'proposal_guardian',
			'implementation_runner',
			'delivery_verifier',
			'technical_investigator',
		])
		.optional()
		.describe('Agent slot (kind "agent").'),
	dryRun: z
		.boolean()
		.optional()
		.describe('Default true: return the files without writing.'),
});

export type IScaffoldArgs = z.infer<typeof SCAFFOLD_INPUT_SCHEMA>;

export interface IScaffoldReport {
	readonly kind: IScaffoldArgs['kind'];
	readonly dryRun: boolean;
	readonly files: readonly IScaffoldedFile[];
	readonly written: readonly string[];
	readonly skipped: readonly string[];
	readonly errors: readonly string[];
}

export const buildScaffoldReport = (
	options: IScaffoldToolOptions,
	args: IScaffoldArgs
): IScaffoldReport => {
	const hostOptions: IScaffoldHostOptions = {
		projectName: options.projectName,
		namespacePrefix: options.namespacePrefix,
		serverPackageName: options.serverPackageName,
		...(options.defaultModel !== undefined
			? { defaultModel: options.defaultModel }
			: {}),
	};
	const dryRun = args.dryRun ?? true;
	const errors: string[] = [];
	let files: readonly IScaffoldedFile[] = [];

	const name = args.name ?? '';
	const description = args.description ?? `TODO: describe ${name}.`;
	switch (args.kind) {
		case 'tool':
			if (name.length === 0) errors.push('kind "tool" requires name');
			else
				files = [
					scaffoldToolFile(
						options.namespacePrefix,
						name,
						description
					),
				];
			break;
		case 'prompt':
			if (name.length === 0) errors.push('kind "prompt" requires name');
			else
				files = [
					scaffoldPromptFile(
						options.namespacePrefix,
						name,
						description
					),
				];
			break;
		case 'skill':
			if (name.length === 0) errors.push('kind "skill" requires name');
			else
				files = [
					scaffoldSkillFile(
						options.namespacePrefix,
						name,
						description
					),
				];
			break;
		case 'agent':
			files = [
				scaffoldAgentFile(
					hostOptions,
					(args.slot ?? 'orchestrator') as IScaffoldAgentSlot
				),
			];
			break;
		case 'host':
			files = scaffoldHostProject(hostOptions);
			break;
		case 'plugin':
			if (name.length === 0) errors.push('kind "plugin" requires name');
			else
				files = scaffoldPluginFiles({
					pluginName: name,
					description,
				});
			break;
		case 'client':
			if (name.length === 0) errors.push('kind "client" requires name');
			else
				files = scaffoldClientFiles({
					clientName: name,
					description,
				});
			break;
	}

	const written: string[] = [];
	const skipped: string[] = [];
	if (!dryRun && errors.length === 0) {
		for (const file of files) {
			const absolute = options.workspace.resolve(file.path);
			if (existsSync(absolute)) {
				skipped.push(file.path);
				continue;
			}
			try {
				mkdirSync(dirname(absolute), { recursive: true });
				writeFileSync(absolute, file.content, 'utf8');
				written.push(file.path);
			} catch (error) {
				errors.push(
					`${file.path}: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	}
	return { kind: args.kind, dryRun, files, written, skipped, errors };
};

/** Registration for the host's `<prefix>_scaffold` tool. */
export const buildScaffoldToolRegistration = (
	options: IScaffoldToolOptions
): IToolRegistration => ({
	id: 'scaffold',
	summary:
		'Generate a tool / prompt / skill / agent / host project / plugin from templates (dry-run by default).',
	tags: ['bootstrap'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_scaffold`,
			{
						outputSchema: z.object({}).catchall(z.unknown()),
				description:
					'Generate host artefacts from mcp-core templates: a new tool, prompt, skill, agent adapter, or the complete host project (server, host config, orchestrator and subagents). Dry-run by default; writes never overwrite existing files.',
				inputSchema: SCAFFOLD_INPUT_SCHEMA,
			},
			async (args: IScaffoldArgs) => {
				const report = buildScaffoldReport(options, args);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(report, null, '\t'),
						},
					],
					structuredContent: report as unknown as Record<
						string,
						unknown
					>,
				};
			}
		);
	},
});
