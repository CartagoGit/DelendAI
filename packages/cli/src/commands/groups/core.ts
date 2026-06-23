/**
 * f00046 S5 — fs + knowledge + project commands. One subcommand per the
 * corresponding `mcp-vertex_*` core meta-tool. The fs tools are
 * workspace-contained (the core rejects `../`/absolute paths) and
 * `fs write` is atomic-by-default (mutex+rename) inside the plugin.
 *
 * Tools mapped:
 *   - `mcp-vertex_fs_read`         ({ path, range? })
 *   - `mcp-vertex_fs_write`        ({ path, content, createDirs?, atomic? })
 *   - `mcp-vertex_knowledge`       ({ id? })
 *   - `mcp-vertex_analyze_project` ({ serverName?, namespacePrefix?, ... })
 *   - `mcp-vertex_plan_mcp_project`({ serverName?, namespacePrefix?, tests? })
 *   - `mcp-vertex_create_project`  ({ kind, ... })
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
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
			return usage(
				'fs write <path> --content=<string> [--create-dirs] [--no-atomic]',
			);
		}
		return data(
			await request(ctx, 'mcp-vertex_fs_write', {
				path,
				content,
				...(hasFlag(args, 'create-dirs') ? { createDirs: true } : {}),
				...(hasFlag(args, 'no-atomic') ? { atomic: false } : {}),
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

export const coreExtraCommands: readonly ICliCommand[] = [
	fsReadCommand,
	fsWriteCommand,
	knowledgeCommand,
	projectAnalyzeCommand,
	projectPlanCommand,
	projectCreateCommand,
];
