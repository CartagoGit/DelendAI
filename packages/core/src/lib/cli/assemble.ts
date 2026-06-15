import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
	analyzeProject,
	buildBootstrapToolRegistrations,
	buildServerBlueprint,
	createWorkspaceFileReader,
} from '../bootstrap/index';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type { IMcpCoreHostConfig } from '../contracts/interfaces/host-config.interface';
import type {
	IPromptRegistration,
	IResourceRegistration,
	IToolRegistration,
} from '../contracts/interfaces/tool-registration.interface';
import {
	DEFAULT_CONFIG_FILENAME,
	diagnoseConfigFile,
	parseConfigFile,
	pluginConfigFor,
} from '../plugins/load-config-file';
import { loadPlugins } from '../plugins/load-plugins';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import type { IMcpPluginContext } from '../plugins/plugin-contract';
import { parseCliArgs } from '../plugins/parse-cli-args';
import type { IMcpCoreCliArgs } from '../plugins/parse-cli-args';
import { buildScaffoldToolRegistration } from '../scaffold/scaffold-tool';
import { createMcpServer } from '../server/create-mcp-server';
import { joinRel } from '../shared/paths';
import { buildKnowledgeResourceRegistrations } from '../tools/knowledge-resources';
import { buildKnowledgeToolRegistration } from '../tools/knowledge-tool';
import { buildOverviewToolRegistration } from '../tools/overview-tool';
import type {
	IOverviewSnapshot,
	IOverviewToolEntry,
} from '../tools/overview-tool';
import { buildStartPromptRegistration } from '../tools/start-prompt';
import { buildValidationMatrixToolRegistration } from '../tools/validation-matrix-tool';
import { createWorkspacePathProvider } from '../workspace/create-workspace-path-provider';

export interface IAssembledCliConfig {
	readonly config: IMcpCoreHostConfig;
	readonly loadResult: IPluginLoadResult;
}

export interface IAssembleCliDeps {
	/** Injectable plugin importer (default: dynamic `import`). */
	import?: (specifier: string) => Promise<unknown>;
	/** Injectable config-file reader (default: node fs). */
	readFile?: (absolutePath: string) => string | undefined;
}

/**
 * Build the full host config from parsed CLI args: resolve the
 * workspace and core paths (CLI flag > config file > default), load
 * every `--plugins` entry passing each its `mcp-core.config.json`
 * options, merge the registrations, and always expose the core
 * meta-tools (scaffold + the hybrid analyze/create_server bootstrap).
 * Pure except for the injectable importer/reader, so it is fully
 * testable.
 */
export const assembleCliConfig = async (
	args: IMcpCoreCliArgs,
	deps: IAssembleCliDeps = {}
): Promise<IAssembledCliConfig> => {
	const workspace = createWorkspacePathProvider(args.workspace);
	const readFile =
		deps.readFile ??
		((absolutePath: string) =>
			existsSync(absolutePath)
				? readFileSync(absolutePath, 'utf8')
				: undefined);

	// Config file: --config, else `mcp-core.config.json` at the workspace.
	const configPath =
		args.configPath ?? join(args.workspace, DEFAULT_CONFIG_FILENAME);
	const fileConfig = parseConfigFile(readFile(configPath));

	// Precedence for roots: explicit CLI flag > config file > default.
	const cacheDir =
		args.tokens['cacheDir'] ??
		fileConfig.cacheDir ??
		DEFAULT_CORE_PATHS.cacheDir;
	const docsDir =
		args.tokens['docsDir'] ?? fileConfig.docsDir ?? DEFAULT_CORE_PATHS.docsDir;
	const corePaths = { cacheDir, docsDir };
	const corePrefix = args.namespacePrefix ?? 'mcpcore';

	const buildContext = (pluginName: string): IMcpPluginContext => {
		const pluginConfig = pluginConfigFor(fileConfig, pluginName);
		return {
			workspace,
			corePaths,
			cacheDir: corePaths.cacheDir,
			docsDir: corePaths.docsDir,
			pluginCacheDir: joinRel(corePaths.cacheDir, pluginName),
			pluginDocsDir: joinRel(corePaths.docsDir, pluginName),
			namespacePrefix: pluginConfig.prefix ?? pluginName,
			options: pluginConfig.options ?? {},
			args: args.extra,
		};
	};

	const loadResult = await loadPlugins({
		specifiers: args.plugins,
		buildContext,
		...(deps.import ? { import: deps.import } : {}),
	});

	const prompts: IPromptRegistration[] = [];
	const resources: IResourceRegistration[] = [];
	const knowledge: IKnowledgeEntry[] = [];
	const pluginToolEntries: IOverviewToolEntry[] = [];
	// Plugin tools, with their id namespaced to the plugin's prefix. Two
	// plugins may legitimately ship a tool with the same internal id (e.g.
	// `status`); the MCP names (`a_status`, `b_status`) never collide, so
	// the registration-order uniqueness check must run on the qualified id,
	// not the raw one. [R12]
	const qualifiedPluginTools: IToolRegistration[] = [];

	for (const { plugin, registrations } of loadResult.loaded) {
		const ns = pluginConfigFor(fileConfig, plugin.name).prefix ?? plugin.name;
		if (registrations.prompts) prompts.push(...registrations.prompts);
		if (registrations.resources) resources.push(...registrations.resources);
		if (registrations.knowledge) knowledge.push(...registrations.knowledge);
		for (const tool of registrations.tools ?? []) {
			pluginToolEntries.push({
				name: `${ns}_${tool.id}`,
				summary: tool.summary,
				tags: tool.tags,
			});
			qualifiedPluginTools.push({
				...tool,
				id: `${ns}_${tool.id}`,
				// A same-plugin anchor must point at the qualified id too.
				...(tool.registerAfter !== undefined
					? { registerAfter: `${ns}_${tool.registerAfter}` }
					: {}),
			});
		}
	}

	const validationMatrix = fileConfig.validationMatrix ?? { scopes: {} };
	const isLoaded = (name: string): boolean =>
		loadResult.loaded.some((entry) => entry.plugin.name === name);
	const hasProposals = isLoaded('proposals');
	const hasRules = isLoaded('rules');
	const rulesClause = hasRules
		? ' ALWAYS write new or modified code already compliant with the active rules (rules_get_rules) — it is the default, no need to be told.'
		: '';
	const recommendedNextAction =
		(hasProposals
			? `Call ${corePrefix}_overview, then proposals_auto_work to start working.`
			: `Call ${corePrefix}_analyze_project to see what this project needs.`) +
		rulesClause;

	// Core meta-tools. `overview` first so it is the obvious entry point.
	// `let` so the (lazily called) snapshot closure can read the final list.
	let coreTools: IToolRegistration[] = [];
	const buildSnapshot = (): IOverviewSnapshot => ({
		server: { name: args.serverName, version: args.serverVersion },
		namespacePrefix: corePrefix,
		corePaths,
		plugins: loadResult.loaded.map((entry) => ({
			name: entry.plugin.name,
			version: entry.plugin.version,
			describe: entry.plugin.describe,
		})),
		tools: [
			...coreTools.map((reg) => ({
				name: `${corePrefix}_${reg.id}`,
				summary: reg.summary,
				tags: reg.tags,
			})),
			...pluginToolEntries,
		],
		knowledge: knowledge.map((entry) => ({
			id: entry.id,
			title: entry.title,
		})),
		recommendedNextAction,
	});

	coreTools = [
		buildOverviewToolRegistration(corePrefix, buildSnapshot),
		buildKnowledgeToolRegistration(corePrefix, () => knowledge),
		buildValidationMatrixToolRegistration(corePrefix, () => validationMatrix),
		...buildBootstrapToolRegistrations({
			workspace,
			namespacePrefix: corePrefix,
		}),
		buildScaffoldToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
			projectName: args.serverName,
			serverPackageName: '@cartago-git/mcp-core',
		}),
	];

	// Core tools keep their bare id (single namespace); plugin tools are
	// already qualified above so the uniqueness check is per-namespace. [R12]
	const tools: IToolRegistration[] = [...coreTools, ...qualifiedPluginTools];

	// Surface knowledge as native MCP resources too (list/read/cache).
	resources.push(...buildKnowledgeResourceRegistrations(knowledge));

	// A "start" workflow prompt for one-click orientation in clients.
	prompts.unshift(
		buildStartPromptRegistration(corePrefix, () => recommendedNextAction)
	);

	const config: IMcpCoreHostConfig = {
		metadata: {
			name: args.serverName,
			version: args.serverVersion,
			description: 'mcp-core server (CLI plugin loader).',
		},
		namespacePrefix: corePrefix,
		workspace,
		corePaths,
		validationMatrix,
		knowledge,
		extraTools: tools,
		extraPrompts: prompts,
		extraResources: resources,
	};

	return { config, loadResult };
};

export interface IDoctorReport {
	readonly ok: boolean;
	readonly configPath: string;
	readonly config: { readonly present: boolean; readonly issues: readonly string[] };
	readonly paths: { readonly cacheDir: string; readonly docsDir: string };
	readonly plugins: {
		readonly requested: readonly string[];
		readonly loaded: readonly string[];
		readonly errors: readonly string[];
	};
	readonly counts: {
		readonly tools: number;
		readonly prompts: number;
		readonly resources: number;
	};
	/** True if the real MCP server assembled without registration errors. */
	readonly assembles: boolean;
	readonly assemblyError?: string;
}

/**
 * `--check` diagnostics: validate the config file, resolve and load
 * every requested plugin, and report what the server WOULD expose —
 * without starting the stdio transport. The fast way to debug a setup
 * in any environment before wiring it into a client.
 */
export const runDoctor = async (
	args: IMcpCoreCliArgs,
	deps: IAssembleCliDeps = {}
): Promise<IDoctorReport> => {
	const readFile =
		deps.readFile ??
		((absolutePath: string) =>
			existsSync(absolutePath)
				? readFileSync(absolutePath, 'utf8')
				: undefined);
	const configPath =
		args.configPath ?? join(args.workspace, DEFAULT_CONFIG_FILENAME);
	const configDiag = diagnoseConfigFile(readFile(configPath));
	const { config, loadResult } = await assembleCliConfig(args, deps);

	// Assemble the REAL server (no stdio) to catch registration errors
	// (e.g. duplicate tool ids) that a config-only check would miss.
	let assembles = true;
	let assemblyError: string | undefined;
	try {
		await createMcpServer(config);
	} catch (error) {
		assembles = false;
		assemblyError = error instanceof Error ? error.message : String(error);
	}

	return {
		ok:
			configDiag.issues.length === 0 &&
			loadResult.errors.length === 0 &&
			assembles,
		configPath,
		config: configDiag,
		paths: config.corePaths ?? { cacheDir: args.cacheDir, docsDir: args.docsDir },
		plugins: {
			requested: args.plugins,
			loaded: loadResult.loaded.map((entry) => entry.plugin.name),
			errors: loadResult.errors.map((error) => error.message),
		},
		counts: {
			tools: config.extraTools?.length ?? 0,
			prompts: config.extraPrompts?.length ?? 0,
			resources: config.extraResources?.length ?? 0,
		},
		assembles,
		...(assemblyError !== undefined ? { assemblyError } : {}),
	};
};

/**
 * First-start hook: analyze the project and persist an EXHAUSTIVE
 * blueprint for a project-specific MCP server to the cache, so an agent
 * can review and materialise it. Idempotent (writes once) and never
 * writes into the repo itself. Skipped by `--mcp-server-create=false`.
 * If a server already exists, the blueprint's notes explain how to
 * integrate it with mcp-core organically.
 */
export const prepareServerBlueprintOnStart = (
	args: IMcpCoreCliArgs
): { written: boolean; path: string } => {
	const cacheDir = args.tokens['cacheDir'] ?? DEFAULT_CORE_PATHS.cacheDir;
	const relPath = `${cacheDir.replace(/\/+$/, '')}/bootstrap/blueprint.json`;
	const absPath = join(args.workspace, relPath);
	if (existsSync(absPath)) return { written: false, path: relPath };
	const reader = createWorkspaceFileReader({
		root: args.workspace,
		resolve: (rel) => join(args.workspace, rel),
	});
	const analysis = analyzeProject(reader);
	const blueprint = buildServerBlueprint(analysis, {
		tests: args.mcpServerTests,
	});
	mkdirSync(dirname(absPath), { recursive: true });
	writeFileSync(
		absPath,
		`${JSON.stringify({ generatedAt: new Date().toISOString(), blueprint }, null, '\t')}\n`,
		'utf8'
	);
	return { written: true, path: relPath };
};

/** Entry point for the `mcp-core` bin. */
export const runCli = async (
	argv: readonly string[],
	cwd: string
): Promise<void> => {
	const args = parseCliArgs(argv, cwd);

	// `--check`/`--doctor`: print a diagnostic report and exit (no stdio).
	if (args.tokens['check'] !== undefined || args.tokens['doctor'] !== undefined) {
		const report = await runDoctor(args);
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		if (!report.ok) process.exitCode = 1;
		return;
	}

	// First start: prepare the project-specific server blueprint.
	if (args.mcpServerCreate) {
		try {
			const result = prepareServerBlueprintOnStart(args);
			if (result.written) {
				process.stderr.write(
					`[mcp-core] wrote a project MCP server blueprint to ${result.path}; review it or call mcpcore_plan_mcp_server.\n`
				);
			}
		} catch {
			// best-effort; never block boot.
		}
	}

	const { config, loadResult } = await assembleCliConfig(args);
	for (const error of loadResult.errors) {
		// stderr only: stdout is the MCP stdio transport.
		process.stderr.write(`[mcp-core] plugin error: ${error.message}\n`);
	}
	const assembled = await createMcpServer(config);
	await assembled.start();
};
