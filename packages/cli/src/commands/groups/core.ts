/**
 * f00046 S5 — fs + knowledge + project commands. One subcommand per the
 * corresponding `mcp-vertex_*` core meta-tool. The fs tools are
 * workspace-contained (the core rejects `../`/absolute paths) and
 * `fs write` is atomic-by-default (mutex+rename) inside the plugin.
 *
 * Tools mapped:
 *   - `mcp-vertex_fs_read`         ({ path, range? })
 *   - `mcp-vertex_fs_write`        ({ path, content, createDirs? })
 *   - `mcp-vertex_knowledge`       ({ id? })
 *   - `mcp-vertex_analyze_project` ({ serverName?, namespacePrefix?, ... })
 *   - `mcp-vertex_plan_mcp_project`({ serverName?, namespacePrefix?, tests? })
 *   - `mcp-vertex_create_project`  ({ kind, ... })
 */
import {
	createWorkspacePathProvider,
	runCreatePlugin,
} from '@mcp-vertex/core/public';

import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import {
	data,
	hasFlag,
	numberArg,
	positionalArg,
	request,
	scalarArg,
	usage,
} from './group-helpers';

const fsReadCommand: ICliCommand = {
	name: 'fs read',
	summary: 'Read a workspace file (optionally a line range).',
	async run(args, ctx) {
		const path = positionalArg(args);
		if (path === undefined)
			return usage('fs read <path> [--start=N --end=N]');
		const start = numberArg(args, 'start');
		const end = numberArg(args, 'end');
		const range =
			start !== undefined && end !== undefined
				? { range: [start, end] as [number, number] }
				: {};
		return data(
			await request(ctx, 'mcp-vertex_fs_read', { path, ...range }),
		);
	},
};

const fsWriteCommand: ICliCommand = {
	name: 'fs write',
	summary:
		'Write a workspace file (atomic by default, never outside the root).',
	async run(args, ctx) {
		const path = positionalArg(args);
		const content = scalarArg(args, 'content');
		if (path === undefined || content === undefined) {
			return usage('fs write <path> --content=<string> [--create-dirs]');
		}
		// r00003 S3 (F-003, LSP): the MCP `fs_write` tool's surface no
		// longer accepts `atomic` — atomicity is non-negotiable for the
		// LLM-facing path. The CLI flag was the only escape hatch; if a
		// user really needs non-atomic writes (bulk migration, repair of
		// a partially-corrupt file), they should call the in-process
		// `fsWrite` helper from a script, not through the LLM-facing tool.
		if (hasFlag(args, 'no-atomic')) {
			return data({
				ok: false,
				error: '--no-atomic is no longer supported via the CLI: the `mcp-vertex_fs_write` tool is always atomic. For non-atomic writes, use the in-process `fsWrite` helper from a Bun script.',
			});
		}
		return data(
			await request(ctx, 'mcp-vertex_fs_write', {
				path,
				content,
				...(hasFlag(args, 'create-dirs') ? { createDirs: true } : {}),
			}),
		);
	},
};

const knowledgeCommand: ICliCommand = {
	name: 'knowledge',
	summary: 'List knowledge entries, or print one by id.',
	async run(args, ctx) {
		const id = positionalArg(args);
		return data(
			await request(ctx, 'mcp-vertex_knowledge', {
				...(id !== undefined ? { id } : {}),
			}),
		);
	},
};

const projectAnalyzeCommand: ICliCommand = {
	name: 'project analyze',
	summary:
		'Inspect the project and recommend an MCP server plan (read-only).',
	async run(args, ctx) {
		const serverName = scalarArg(args, 'server-name');
		const namespacePrefix = scalarArg(args, 'prefix');
		return data(
			await request(ctx, 'mcp-vertex_analyze_project', {
				...(serverName !== undefined ? { serverName } : {}),
				...(namespacePrefix !== undefined ? { namespacePrefix } : {}),
			}),
		);
	},
};

const projectPlanCommand: ICliCommand = {
	name: 'project plan',
	summary:
		'Return an exhaustive blueprint for a project-specific MCP server.',
	async run(args, ctx) {
		const serverName = scalarArg(args, 'server-name');
		const namespacePrefix = scalarArg(args, 'prefix');
		const noTests = hasFlag(args, 'no-tests');
		return data(
			await request(ctx, 'mcp-vertex_plan_mcp_project', {
				...(serverName !== undefined ? { serverName } : {}),
				...(namespacePrefix !== undefined ? { namespacePrefix } : {}),
				...(noTests ? { tests: false } : {}),
			}),
		);
	},
};

const projectCreateCommand: ICliCommand = {
	name: 'project create',
	summary: 'Generate the files for a project MCP server, plugin, or client.',
	async run(args, ctx) {
		const kind = scalarArg(args, 'kind');
		if (kind === undefined) {
			return usage(
				'project create --kind=host|plugin|client [--name=...]',
			);
		}
		const projectName =
			scalarArg(args, 'name') ?? scalarArg(args, 'project');
		const pluginName = scalarArg(args, 'plugin');
		const clientName = scalarArg(args, 'client');
		const namespacePrefix = scalarArg(args, 'prefix');
		const description = scalarArg(args, 'description');
		return data(
			await request(ctx, 'mcp-vertex_create_project', {
				kind,
				...(projectName !== undefined ? { projectName } : {}),
				...(pluginName !== undefined ? { pluginName } : {}),
				...(clientName !== undefined ? { clientName } : {}),
				...(namespacePrefix !== undefined ? { namespacePrefix } : {}),
				...(description !== undefined ? { description } : {}),
			}),
		);
	},
};

interface IPluginNewCommandDeps {
	readonly createWorkspacePathProvider: typeof createWorkspacePathProvider;
	readonly runCreatePlugin: typeof runCreatePlugin;
}

export const buildPluginNewCommand = (
	deps: IPluginNewCommandDeps = {
		createWorkspacePathProvider,
		runCreatePlugin,
	},
): ICliCommand => ({
	name: 'plugin new',
	summary:
		'Scaffold and wire a new first-party plugin, then run the wiring doctor.',
	async run(args, ctx) {
		const name = positionalArg(args);
		if (name === undefined) {
			return usage('plugin new <name> [--description=...] [--dry-run]');
		}
		const description = scalarArg(args, 'description');
		if (description === undefined) {
			return usage('plugin new <name> [--description=...] [--dry-run]');
		}
		try {
			const report = await deps.runCreatePlugin(
				{
					name,
					description,
					...(hasFlag(args, 'dry-run') ? { dryRun: true } : {}),
				},
				{
					workspace: deps.createWorkspacePathProvider(
						ctx.globals.workspace,
					),
				},
			);
			if (ctx.globals.json) {
				return data(
					report,
					report.doctor.fullyWired
						? EXIT_CODE.OK
						: EXIT_CODE.VALIDATION,
				);
			}
			const lines = [
				`plugin: ${report.pluginId}`,
				`scaffolded: ${report.scaffolded.files.join(', ')}`,
				`wired: ${report.wired.map((entry) => entry.pointId).join(', ')}`,
				`doctor: ${report.doctor.fullyWired ? 'fully wired' : `missing ${report.doctor.missing.join(', ')}`}`,
			];
			return {
				code: report.doctor.fullyWired
					? EXIT_CODE.OK
					: EXIT_CODE.VALIDATION,
				text: `${lines.join('\n')}\n`,
				data: report,
			};
		} catch (error) {
			return {
				code: EXIT_CODE.VALIDATION,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

export const coreExtraCommands: readonly ICliCommand[] = [
	fsReadCommand,
	fsWriteCommand,
	knowledgeCommand,
	projectAnalyzeCommand,
	projectPlanCommand,
	projectCreateCommand,
	buildPluginNewCommand(),
];
