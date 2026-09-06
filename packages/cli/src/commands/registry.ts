import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { applyJsoncEdits, parseJsonc } from '@delendai/core/public';

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
	writeConfigTextSafely,
	writeWorkspaceFileSafely,
} from '../lib/config-file.service';
import {
	data,
	hasFlag,
	isRecord,
	request,
	scalarArg,
} from '../lib/helpers/cli-command.helper';
import { formatRows } from '../lib/text-format.service';
import { agentsCommands } from './groups/agents';
import { auditCommands } from './groups/audit';
import { conventionsCommands } from './groups/conventions';
import { coreExtraCommands } from './groups/core';
import { depsCommands } from './groups/deps';
import { docsCommands } from './groups/docs';
import { doctorCommands } from './groups/doctor';
import {
	gitBlameCommand,
	gitChangedCommand,
	gitChangelogCommand,
	gitDiffCommand,
	gitLogCommand,
	gitPrListCommand,
	gitPrViewCommand,
	gitShowCommand,
	gitStatusCommand,
	gitWorktreeCommand,
} from './groups/git';
import { logsCommands } from './groups/logs';
import { memoryCommands } from './groups/memory';
import { notificationCommands } from './groups/notification';
import { kpisCommands } from './kpis.command';
import { proposalsCommands } from './groups/proposals';
import { pluginsCommands } from './groups/plugins';
import { qualityCommands } from './groups/quality';
import { routerDashboardCommands } from './groups/router-dashboard';
import { rulesCommands } from './groups/rules';
import { securityCommands } from './groups/security';
import { statusMarkerCommands } from './groups/status-marker';
import { testConventionCommands } from './groups/test-convention';
import { usageTrackingCommands } from './groups/usage-tracking';
import { webFetchCommands } from './groups/web-fetch';

const text = (
	body: string,
	code: ICliCommandResult['code'] = EXIT_CODE.OK,
): ICliCommandResult => ({
	code,
	text: body.endsWith('\n') ? body : `${body}\n`,
});

/**
 * a00087: the runner (`index.ts`) only ever writes `result.data` to
 * stdout when `--json`/`--format=json` is explicit — by design, so a
 * command that already prints its own human recap (like `init`) never
 * gets a duplicate JSON dump. But a dozen read-only commands here
 * (`status`, `overview`, `metrics`, `validate-matrix`, `config *`,
 * `search`, `docs *`, `scaffold`, `plugin inspect`) never grew that
 * recap — they returned bare `data(...)` and were **completely silent**
 * by default (exit 0, zero stdout/stderr), indistinguishable from a
 * hang for a human running `delendai status` the obvious way. Until each
 * gets a bespoke formatter, fall back to pretty-printed JSON through
 * the `.text` channel (always emitted) instead of `.data` (json-gated).
 */
const dataOrText = (
	value: unknown,
	ctx: ICliCommandContext,
	code: ICliCommandResult['code'] = EXIT_CODE.OK,
): ICliCommandResult =>
	ctx.globals.json || ctx.globals.format === 'json'
		? data(value, code)
		: text(JSON.stringify(value, null, 2), code);

const overview = async (ctx: ICliCommandContext, compact = false) =>
	request<Record<string, unknown>>(ctx, 'delendai_overview', { compact });

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
		// a00087: every registered tool name is
		// `${namespacePrefix}_${plugin}_${tool}` (core tools omit the
		// plugin infix: `${namespacePrefix}_${tool}`), never a bare
		// `${plugin}_${tool}` — the old `${pluginName}_` prefix check
		// never matched a single real tool name, so `plugin inspect
		// <anything>` always returned an empty `tools: []`.
		const namespacePrefix =
			typeof snapshot.namespacePrefix === 'string'
				? snapshot.namespacePrefix
				: 'delendai';
		const toolNameOf = (tool: unknown): string =>
			typeof tool === 'string'
				? tool
				: String((tool as Record<string, unknown>).name ?? '');
		const otherPluginPrefixes = (
			Array.isArray(snapshot.plugins) ? snapshot.plugins : []
		)
			.map((plugin) =>
				typeof plugin === 'string'
					? plugin
					: String((plugin as Record<string, unknown>).name ?? ''),
			)
			.filter((name) => name !== '' && name !== pluginName)
			.map((name) => `${namespacePrefix}_${name}_`);
		const prefix = `${namespacePrefix}_${pluginName}_`;
		const matchesPlugin = (toolName: string): boolean =>
			pluginName === 'core'
				? toolName.startsWith(`${namespacePrefix}_`) &&
					!otherPluginPrefixes.some((other) =>
						toolName.startsWith(other),
					)
				: toolName.startsWith(prefix);
		const tools = (
			Array.isArray(snapshot.tools) ? snapshot.tools : []
		).filter((tool) => matchesPlugin(toolNameOf(tool)));
		return dataOrText(
			{ plugin: pluginName, tools },
			ctx,
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
			return dataOrText(await request(ctx, 'delendai_status'), ctx);
		},
	},
	{
		name: 'overview',
		summary: 'Show loaded server map.',
		async run(args, ctx) {
			return dataOrText(await overview(ctx, !hasFlag(args, 'full')), ctx);
		},
	},
	listCommand,
	inspectCommand,
	{
		// b00239 S2/S6: register the alias subcommand. Lazy-import
		// to keep the eager boot path (status / overview / metrics)
		// free of node:fs/promises until a user actually asks for
		// alias provisioning.
		name: 'alias',
		summary:
			'Provision the `est` human alias for the canonical `delendai` CLI.',
		usage:
			'alias [status|install|remove]  [--options-alias-bin-dir=<path>]',
		async run(args, ctx) {
			const { aliasCommand } = await import('./alias.command');
			return aliasCommand.run(args, ctx);
		},
	},
	{
		name: 'metrics',
		summary: 'Show per-tool metrics.',
		async run(args, ctx) {
			return dataOrText(
				await request(ctx, 'delendai_metrics', {
					reset: hasFlag(args, 'reset'),
					persist: hasFlag(args, 'persist'),
				}),
				ctx,
			);
		},
	},
	{
		name: 'validate-matrix',
		summary: 'Show configured validation matrix.',
		async run(_args, ctx) {
			return dataOrText(
				await request(ctx, 'delendai_get_validation_matrix'),
				ctx,
			);
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
			const path = `${ctx.globals.workspace}/packages/core/schema/delendai.config.schema.json`;
			if (!existsSync(path))
				return {
					code: EXIT_CODE.NOT_FOUND,
					error: `schema not found at ${path}`,
				};
			const schema = JSON.parse(await readFile(path, 'utf8')) as unknown;
			return dataOrText(schema, ctx);
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
			// The config on disk is JSONC. Reading it with JSON.parse
			// would make a user who commented their own file unable to
			// even display it.
			const { value, errors } = parseJsonc(raw);
			if (errors.length > 0) {
				return {
					code: EXIT_CODE.USAGE,
					error: `invalid JSONC in ${configPathFor(ctx.globals.workspace)}: ${errors[0] ?? 'parse error'}`,
				};
			}
			return dataOrText(value, ctx);
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
			const { value, errors } = parseJsonc(raw);
			if (errors.length > 0) {
				return {
					code: EXIT_CODE.USAGE,
					error: `invalid JSONC in ${configPathFor(ctx.globals.workspace)}: ${errors[0] ?? 'parse error'}`,
				};
			}
			return dataOrText(getDotPath(value, key.split('.')), ctx);
		},
	},
	{
		name: 'config doctor',
		summary: 'Diagnose the config file.',
		async run(_args, ctx) {
			return dataOrText(
				diagnoseConfigText(await readConfigText(ctx.globals.workspace)),
				ctx,
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
			const plan = parseSetExpression(expression);
			// There is no config yet: nothing to preserve, so the object
			// writer is exactly right.
			if (raw === undefined) {
				const created = await writeConfigSafely(
					ctx.globals.workspace,
					setDotPath({}, plan.path, plan.value),
				);
				return dataOrText(
					{ path: created, updated: plan.path.join('.') },
					ctx,
				);
			}
			const { errors } = parseJsonc(raw);
			if (errors.length > 0) {
				// Refusing beats rewriting: a file we cannot parse is one
				// whose contents we would be replacing blind.
				return {
					code: EXIT_CODE.USAGE,
					error: `invalid JSONC in ${configPathFor(ctx.globals.workspace)}: ${errors[0] ?? 'parse error'}; fix it before setting a value`,
				};
			}
			// Edit the text in place. Rebuilding the object and
			// re-serialising it would set the value correctly and destroy
			// every comment the user wrote around it — which is the one
			// thing a config format that admits comments must never do.
			const path = await writeConfigTextSafely(
				ctx.globals.workspace,
				applyJsoncEdits(raw, [{ path: plan.path, value: plan.value }]),
			);
			return dataOrText({ path, updated: plan.path.join('.') }, ctx);
		},
	},
	{
		name: 'init',
		summary:
			'Interactive workspace bootstrap for delendai (f00084 S2). Writes config, .vscode/mcp.json, .agent.md, host-instructions.',
		usage: 'init [--dry-run] [--force]',
		async run(args, ctx) {
			// f00084 S2: forward to the new interactive command while keeping
			// the same `init` name and --force / --dry-run flag semantics.
			// The legacy minimal-config path is preserved as a no-prompt
			// fallback when stdin is not a TTY.
			const { initCommand } = await import('./init/init.command');
			return initCommand.run(args, ctx);
		},
	},
	{
		// f00103: non-interactive counterpart of `init`. Same flag
		// surface, pre-baked defaults (swarm + overwrite + skills +
		// agents + scaffold + auto-yes), no prompts — safe to run
		// from a fresh checkout or a shell script. The colon name is
		// parsed by the CLI as a single token (no parser change).
		name: 'init:default',
		summary:
			'Non-interactive workspace bootstrap with operator defaults (swarm + overwrite + skills + agents + scaffold).',
		usage: 'init:default [--dry-run] [--delendai-root=<path>] [--plugin-paths-root=<path>]',
		async run(args, ctx) {
			const { initDefaultCommand } = await import(
				'./init/init-default.command'
			);
			return initDefaultCommand.run(args, ctx);
		},
	},
	{
		name: 'init:global',
		summary:
			'Install the shared delendai MCP server into the user-level host configurations.',
		usage: 'init:global [--all] [--ide=<ids>] [--via=<runner>] [--preset=<name>]',
		async run(args, ctx) {
			const { runGlobalInit } = await import(
				'./init/init-global.command'
			);
			return runGlobalInit(args, ctx);
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
			return dataOrText(
				await request(ctx, 'delendai_search_search', {
					query,
					maxResults: Number(scalarArg(args, 'max') ?? 20),
					regex: hasFlag(args, 'regex'),
					include: scalarArg(args, 'include')?.split(','),
					exclude: scalarArg(args, 'exclude')?.split(','),
					...(context !== undefined && Number.isFinite(context)
						? { context }
						: {}),
				}),
				ctx,
			);
		},
	},
	{
		name: 'docs list',
		summary: 'List project documentation.',
		async run(args, ctx) {
			return dataOrText(
				await request(ctx, 'delendai_docs_docs_list', {
					limit: Number(
						scalarArg(args, 'limit') ??
							scalarArg(args, 'max') ??
							50,
					),
					offset: Number(scalarArg(args, 'offset') ?? 0),
				}),
				ctx,
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
				'delendai_docs_docs_read',
				{ path },
			);
			return dataOrText(
				result,
				ctx,
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
			const report = await request(ctx, 'delendai_scaffold', {
				kind,
				name,
				dryRun: true,
			});
			if (out === undefined || hasFlag(args, 'dry-run')) {
				return dataOrText(report, ctx);
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
			return dataOrText({ report, written }, ctx);
		},
	},
	gitStatusCommand,
	gitChangedCommand,
	gitDiffCommand,
	gitLogCommand,
	gitBlameCommand,
	gitShowCommand,
	gitWorktreeCommand,
	gitChangelogCommand,
	gitPrListCommand,
	gitPrViewCommand,
	...agentsCommands,
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
	...pluginsCommands,
	...notificationCommands,
	...kpisCommands,
	...webFetchCommands,
	...statusMarkerCommands,
	...conventionsCommands,
	...doctorCommands,
	...usageTrackingCommands,
	...securityCommands,
	...routerDashboardCommands,
];
