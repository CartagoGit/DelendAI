import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import {
	configPathFor,
	diagnoseConfigText,
	getDotPath,
	parseSetExpression,
	readConfigText,
	setDotPath,
	writeConfigSafely,
	writeWorkspaceFileSafely,
} from '../lib/config-file';
import { formatRows } from '../lib/text-format';
import {
	gitBlameCommand,
	gitChangedCommand,
	gitDiffCommand,
	gitLogCommand,
	gitShowCommand,
	gitStatusCommand,
	gitWorktreeCommand,
} from './groups/git';
import { auditCommands } from './groups/audit';
import { conventionsCommands } from './groups/conventions';
import { coreExtraCommands } from './groups/core';
import { depsCommands } from './groups/deps';
import { docsCommands } from './groups/docs';
import { doctorCommands } from './groups/doctor';
import { logsCommands } from './groups/logs';
import { memoryCommands } from './groups/memory';
import { notificationCommands } from './groups/notification';
import { proposalsCommands } from './groups/proposals';
import { qualityCommands } from './groups/quality';
import { rulesCommands } from './groups/rules';
import { statusMarkerCommands } from './groups/status-marker';
import { testConventionCommands } from './groups/test-convention';
import { webFetchCommands } from './groups/web-fetch';

const text = (body: string, code = EXIT_CODE.OK): ICliCommandResult => ({
	code,
	text: body.endsWith('\n') ? body : `${body}\n`,
});

const data = (
	value: unknown,
	code: ICliCommandResult['code'] = EXIT_CODE.OK,
): ICliCommandResult => ({
	code,
	data: value,
});

const request = <TOut>(
	ctx: ICliCommandContext,
	tool: string,
	args: object = {},
): Promise<TOut> => ctx.request<TOut>(tool, args);

const overview = async (ctx: ICliCommandContext, compact = false) =>
	request<Record<string, unknown>>(ctx, 'mcp-vertex_overview', { compact });

const runProcess = async (
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<ICliCommandResult> =>
	new Promise((resolve) => {
		const child = spawn(command, [...args], {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('close', (code) => {
			resolve({
				code: code === 0 ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
				data: { command, args, exitCode: code, stdout, stderr },
				text: stdout || stderr,
			});
		});
	});

const scalarArg = (
	args: readonly string[],
	name: string,
): string | undefined => {
	const inline = args.find((arg) => arg.startsWith(`--${name}=`));
	if (inline !== undefined) return inline.slice(name.length + 3);
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
};

const hasFlag = (args: readonly string[], name: string): boolean =>
	args.includes(`--${name}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const scaffoldFilesOf = (
	report: unknown,
): ReadonlyArray<{ readonly path: string; readonly content: string }> => {
	if (!isRecord(report) || !Array.isArray(report.files)) return [];
	return report.files.filter(
		(file): file is { readonly path: string; readonly content: string } =>
			isRecord(file) &&
			typeof file.path === 'string' &&
			typeof file.content === 'string',
	);
};

const listCommand: ICliCommand = {
	name: 'plugin list',
	summary: 'List loaded plugins.',
	async run(_args, ctx) {
		const snapshot = await overview(ctx, false);
		const plugins = Array.isArray(snapshot.plugins) ? snapshot.plugins : [];
		if (ctx.globals.json) return data(plugins);
		const rows = plugins.map((plugin) =>
			typeof plugin === 'string'
				? { name: plugin, version: '', description: '' }
				: {
						name: String(
							(plugin as Record<string, unknown>).name ?? '',
						),
						version: String(
							(plugin as Record<string, unknown>).version ?? '',
						),
						description: String(
							(plugin as Record<string, unknown>).describe ?? '',
						),
					},
		);
		return text(formatRows(rows, ['name', 'version', 'description']));
	},
};

const inspectCommand: ICliCommand = {
	name: 'plugin inspect',
	summary: 'Inspect one plugin and its tools.',
	async run(args, ctx) {
		const pluginName = args[0];
		if (pluginName === undefined) {
			return {
				code: EXIT_CODE.USAGE,
				error: 'usage: plugin inspect <name>',
			};
		}
		const snapshot = await overview(ctx, false);
		const prefix = `${pluginName}_`;
		const tools = (
			Array.isArray(snapshot.tools) ? snapshot.tools : []
		).filter((tool) =>
			typeof tool === 'string'
				? tool.startsWith(prefix)
				: String(
						(tool as Record<string, unknown>).name ?? '',
					).startsWith(prefix),
		);
		return data(
			{ plugin: pluginName, tools },
			tools.length === 0 ? EXIT_CODE.NOT_FOUND : EXIT_CODE.OK,
		);
	},
};

export const registerAllCommands = async (): Promise<
	readonly ICliCommand[]
> => [
	{
		name: 'status',
		summary: 'Show runtime status collectors.',
		async run(_args, ctx) {
			return data(await request(ctx, 'mcp-vertex_status'));
		},
	},
	{
		name: 'overview',
		summary: 'Show loaded server map.',
		async run(args, ctx) {
			return data(await overview(ctx, !hasFlag(args, 'full')));
		},
	},
	listCommand,
	inspectCommand,
	{
		name: 'metrics',
		summary: 'Show per-tool metrics.',
		async run(args, ctx) {
			return data(
				await request(ctx, 'mcp-vertex_metrics', {
					reset: hasFlag(args, 'reset'),
					persist: hasFlag(args, 'persist'),
				}),
			);
		},
	},
	{
		name: 'validate-matrix',
		summary: 'Show configured validation matrix.',
		async run(_args, ctx) {
			return data(await request(ctx, 'mcp-vertex_get_validation_matrix'));
		},
	},
	{
		name: 'validate',
		summary: 'Run the root validation gate.',
		async run(_args, ctx) {
			return runProcess(
				'bun',
				['run', 'validate'],
				ctx.globals.workspace,
			);
		},
	},
	{
		name: 'config schema',
		summary: 'Regenerate and show config JSON schema.',
		async run(_args, ctx) {
			const generated = await runProcess(
				'bun',
				['run', 'config:schema'],
				ctx.globals.workspace,
			);
			if (generated.code !== EXIT_CODE.OK) return generated;
			const path = `${ctx.globals.workspace}/packages/core/schema/mcp-vertex.config.schema.json`;
			if (!existsSync(path))
				return {
					code: EXIT_CODE.NOT_FOUND,
					error: `schema not found at ${path}`,
				};
			const schema = JSON.parse(await readFile(path, 'utf8')) as unknown;
			return data(schema);
		},
	},
	{
		name: 'config show',
		summary: 'Show active config file.',
		async run(_args, ctx) {
			const raw = await readConfigText(ctx.globals.workspace);
			if (raw === undefined)
				return {
					code: EXIT_CODE.NOT_FOUND,
					error: `missing ${configPathFor(ctx.globals.workspace)}`,
				};
			return data(JSON.parse(raw) as unknown);
		},
	},
	{
		name: 'config get',
		summary: 'Read one config dot path.',
		async run(args, ctx) {
			const key = args[0];
			if (key === undefined)
				return {
					code: EXIT_CODE.USAGE,
					error: 'usage: config get <dot.path>',
				};
			const raw = await readConfigText(ctx.globals.workspace);
			if (raw === undefined)
				return {
					code: EXIT_CODE.NOT_FOUND,
					error: `missing ${configPathFor(ctx.globals.workspace)}`,
				};
			return data(getDotPath(JSON.parse(raw) as unknown, key.split('.')));
		},
	},
	{
		name: 'config doctor',
		summary: 'Diagnose the config file.',
		async run(_args, ctx) {
			return data(
				diagnoseConfigText(await readConfigText(ctx.globals.workspace)),
			);
		},
	},
	{
		name: 'config set',
		summary: 'Safely set one config dot path.',
		async run(args, ctx) {
			const expression = args[0];
			if (expression === undefined)
				return {
					code: EXIT_CODE.USAGE,
					error: 'usage: config set <dot.path>=<json-value>',
				};
			const raw = await readConfigText(ctx.globals.workspace);
			const current =
				raw === undefined
					? {}
					: (JSON.parse(raw) as Record<string, unknown>);
			const plan = parseSetExpression(expression);
			const next = setDotPath(current, plan.path, plan.value);
			const path = await writeConfigSafely(ctx.globals.workspace, next);
			return data({ path, updated: plan.path.join('.') });
		},
	},
	{
		name: 'init',
		summary: 'Create a minimal mcp-vertex config file.',
		async run(args, ctx) {
			const raw = await readConfigText(ctx.globals.workspace);
			if (raw !== undefined && !hasFlag(args, 'force')) {
				return {
					code: EXIT_CODE.VALIDATION,
					error: `${configPathFor(ctx.globals.workspace)} already exists; pass --force to overwrite`,
				};
			}
			const path = await writeConfigSafely(ctx.globals.workspace, {
				plugins: {},
			});
			return data({
				path,
				created: raw === undefined,
				overwritten: raw !== undefined,
			});
		},
	},
	{
		name: 'search',
		summary: 'Search workspace text files.',
		async run(args, ctx) {
			const query = args.find((arg) => !arg.startsWith('-'));
			if (query === undefined)
				return {
					code: EXIT_CODE.USAGE,
					error: 'usage: search <query> [--max=N] [--context=N] [--regex]',
				};
			// f00046 S6: `--context=N` forwards `context` (lines before/after
			// each hit, 0–10). `--json-lines` is honoured by the global `--json`
			// renderer; it is accepted here so the flag never errors.
			const contextRaw = scalarArg(args, 'context');
			const context =
				contextRaw !== undefined ? Number(contextRaw) : undefined;
			return data(
				await request(ctx, 'mcp-vertex_search_search', {
					query,
					maxResults: Number(scalarArg(args, 'max') ?? 20),
					regex: hasFlag(args, 'regex'),
					include: scalarArg(args, 'include')?.split(','),
					exclude: scalarArg(args, 'exclude')?.split(','),
					...(context !== undefined && Number.isFinite(context)
						? { context }
						: {}),
				}),
			);
		},
	},
	{
		name: 'docs list',
		summary: 'List project documentation.',
		async run(args, ctx) {
			return data(
				await request(ctx, 'mcp-vertex_docs_docs_list', {
					limit: Number(
						scalarArg(args, 'limit') ??
							scalarArg(args, 'max') ??
							50,
					),
					offset: Number(scalarArg(args, 'offset') ?? 0),
				}),
			);
		},
	},
	{
		name: 'docs read',
		summary: 'Read one project documentation file.',
		async run(args, ctx) {
			const path = args[0];
			if (path === undefined)
				return {
					code: EXIT_CODE.USAGE,
					error: 'usage: docs read <path>',
				};
			const result = await request<Record<string, unknown>>(
				ctx,
				'mcp-vertex_docs_docs_read',
				{ path },
			);
			return data(
				result,
				result.found === false ? EXIT_CODE.NOT_FOUND : EXIT_CODE.OK,
			);
		},
	},
	{
		name: 'scaffold',
		summary: 'Generate a scaffold through the core tool.',
		async run(args, ctx) {
			const kind = args[0];
			const name = scalarArg(args, 'name') ?? args[1];
			const out = scalarArg(args, 'out');
			if (kind === undefined || name === undefined) {
				return {
					code: EXIT_CODE.USAGE,
					error: 'usage: scaffold <kind> --name=<name>',
				};
			}
			const report = await request(ctx, 'mcp-vertex_scaffold', {
				kind,
				name,
				dryRun: true,
			});
			if (out === undefined || hasFlag(args, 'dry-run')) {
				return data(report);
			}
			const files = scaffoldFilesOf(report);
			if (files.length === 0) {
				return {
					code: EXIT_CODE.RUNTIME,
					error: 'scaffold produced no writable files',
				};
			}
			const written: string[] = [];
			for (const file of files) {
				const target = files.length === 1 ? out : join(out, file.path);
				written.push(
					await writeWorkspaceFileSafely(
						ctx.globals.workspace,
						target,
						file.content,
					),
				);
			}
			return data({ report, written });
		},
	},
	gitStatusCommand,
	gitChangedCommand,
	gitDiffCommand,
	gitLogCommand,
	gitBlameCommand,
	gitShowCommand,
	gitWorktreeCommand,
	...memoryCommands,
	...depsCommands,
	...rulesCommands,
	...testConventionCommands,
	...qualityCommands,
	...auditCommands,
	...logsCommands,
	...coreExtraCommands,
	...docsCommands,
	...proposalsCommands,
	...notificationCommands,
	...webFetchCommands,
	...statusMarkerCommands,
	...conventionsCommands,
	...doctorCommands,
];
