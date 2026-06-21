// the `<prefix>_scaffold` MCP tool: lets any agent in the host
// workspace generate new tools, prompts, skills, agent adapters or a
// complete host project. Dry-run by default; writes refuse to overwrite
// existing files unless keepLegacy is enabled, in which case the old bytes are
// preserved under legacy/ before fresh templates are written.

import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname } from 'node:path';

import { z } from 'zod';

import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { writeFileAtomic } from '../shared/atomic-write';
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
	readonly projectPackageName: string;
	readonly defaultModel?: string;
	readonly keepLegacy?: boolean;
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
	keepLegacy: z
		.boolean()
		.optional()
		.describe(
			'Override the config-level keepLegacy for this scaffold call.',
		),
});

export type IScaffoldArgs = z.infer<typeof SCAFFOLD_INPUT_SCHEMA>;

// l00007 S2 — mirrors `IScaffoldedFile` (scaffold-host.ts).
const SCAFFOLDED_FILE_SCHEMA = z.object({
	path: z.string(),
	content: z.string(),
});

export interface IScaffoldReport {
	readonly kind: IScaffoldArgs['kind'];
	readonly dryRun: boolean;
	readonly files: readonly IScaffoldedFile[];
	readonly written: readonly string[];
	readonly skipped: readonly string[];
	readonly moved: readonly string[];
	readonly kept: readonly string[];
	readonly errors: readonly string[];
}

// l00007 S2 — mirrors `IScaffoldReport` above field-for-field.
const SCAFFOLD_REPORT_SCHEMA = z.object({
	kind: SCAFFOLD_INPUT_SCHEMA.shape.kind,
	dryRun: z.boolean(),
	files: z.array(SCAFFOLDED_FILE_SCHEMA),
	written: z.array(z.string()),
	skipped: z.array(z.string()),
	moved: z.array(z.string()),
	kept: z.array(z.string()),
	errors: z.array(z.string()),
});

const pathExists = async (absolutePath: string): Promise<boolean> => {
	try {
		await stat(absolutePath);
		return true;
	} catch {
		return false;
	}
};

const legacyPathFor = async (
	workspace: IWorkspacePathProvider,
	relativePath: string,
): Promise<{
	readonly relativePath: string;
	readonly absolutePath: string;
}> => {
	const ext = extname(relativePath);
	const base = basename(relativePath, ext);
	const ts = Date.now().toString(36);
	for (let index = 0; index < 1000; index += 1) {
		const suffix = index === 0 ? '' : `-${index.toString(36)}`;
		const candidate = `legacy/${base}-${ts}${suffix}${ext}`;
		const absolutePath = workspace.resolve(candidate);
		if (!(await pathExists(absolutePath))) {
			return { relativePath: candidate, absolutePath };
		}
	}
	throw new Error(`could not allocate legacy path for ${relativePath}`);
};

const moveToLegacy = async (
	source: string,
	destination: string,
): Promise<'rename' | 'copy-unlink'> => {
	try {
		await rename(source, destination);
		return 'rename';
	} catch (error) {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? (error as { code?: unknown }).code
				: undefined;
		if (code !== 'EXDEV') throw error;
		await copyFile(source, destination);
		await unlink(source);
		return 'copy-unlink';
	}
};

export const buildScaffoldReport = async (
	options: IScaffoldToolOptions,
	args: IScaffoldArgs,
): Promise<IScaffoldReport> => {
	const hostOptions: IScaffoldHostOptions = {
		projectName: options.projectName,
		namespacePrefix: options.namespacePrefix,
		projectPackageName: options.projectPackageName,
		...(options.defaultModel !== undefined
			? { defaultModel: options.defaultModel }
			: {}),
	};
	const dryRun = args.dryRun ?? true;
	const errors: string[] = [];
	let files: readonly IScaffoldedFile[] = [];
	const keepLegacy = args.keepLegacy ?? options.keepLegacy ?? false;

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
						description,
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
						description,
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
						description,
					),
				];
			break;
		case 'agent':
			files = [
				scaffoldAgentFile(
					hostOptions,
					(args.slot ?? 'orchestrator') as IScaffoldAgentSlot,
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
	const moved: string[] = [];
	const kept: string[] = [];
	if (!dryRun && errors.length === 0) {
		for (const file of files) {
			const absolute = options.workspace.resolve(file.path);
			const alreadyExists = await pathExists(absolute);
			if (alreadyExists) {
				if (!keepLegacy) {
					skipped.push(file.path);
					kept.push(file.path);
					continue;
				}
				try {
					const legacy = await legacyPathFor(
						options.workspace,
						file.path,
					);
					await mkdir(dirname(legacy.absolutePath), {
						recursive: true,
					});
					const strategy = await moveToLegacy(
						absolute,
						legacy.absolutePath,
					);
					moved.push(legacy.relativePath);
					if (strategy === 'copy-unlink') {
						errors.push(
							`${file.path}: moved via copy+unlink fallback after cross-device rename`,
						);
					}
				} catch (error) {
					errors.push(
						`${file.path}: ${error instanceof Error ? error.message : String(error)}`,
					);
					continue;
				}
			}
			try {
				await writeFileAtomic(absolute, file.content);
				written.push(file.path);
			} catch (error) {
				errors.push(
					`${file.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}
	return {
		kind: args.kind,
		dryRun,
		files,
		written,
		skipped,
		moved,
		kept,
		errors,
	};
};

/** Registration for the host's `<prefix>_scaffold` tool. */
export const buildScaffoldToolRegistration = (
	options: IScaffoldToolOptions,
): IToolRegistration => ({
	id: 'scaffold',
	effects: ['write'],
	summary:
		'Generate a tool / prompt / skill / agent / host project / plugin from templates (dry-run by default).',
	tags: ['bootstrap'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_scaffold`,
			{
				outputSchema: SCAFFOLD_REPORT_SCHEMA,
				description:
					'Generate host artefacts from mcp-vertex templates: a new tool, prompt, skill, agent adapter, or the complete host project (server, host config, orchestrator and subagents). Dry-run by default; writes skip existing files unless keepLegacy moves them under legacy/ first.',
				inputSchema: SCAFFOLD_INPUT_SCHEMA,
			},
			async (args: IScaffoldArgs) => {
				const report = await buildScaffoldReport(options, args);
				return {
					content: [
						{
							type: 'text' as const,
							// Compact (H3): the response is agent-context tokens;
							// structuredContent below carries the typed payload.
							text: JSON.stringify(report),
						},
					],
					structuredContent: report as unknown as Record<
						string,
						unknown
					>,
				};
			},
		);
	},
});
