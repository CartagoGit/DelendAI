import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	analyzeProject,
	buildBootstrapToolRegistrations,
	buildServerBlueprint,
	createWorkspaceFileReader,
} from '../bootstrap/index';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type { IMcpVertexHostConfig } from '../contracts/interfaces/host-config.interface';
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
import { loadPlugins, nodeDynamicImport } from '../plugins/load-plugins';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import type { IMcpPluginContext } from '../plugins/plugin-contract';
import { parseCliArgs } from '../plugins/parse-cli-args';
import type { IMcpVertexCliArgs } from '../plugins/parse-cli-args';
import { buildScaffoldToolRegistration } from '../scaffold/scaffold-tool';
import { createMcpProject } from '../project/create-mcp-project';
import { joinRel } from '../shared/paths';
import {
	createFileSystemBlueprintWriter,
	type IBlueprintWriter,
} from '../shared/blueprint-writer';
import type {
	IProposalSummary,
	ISkillSummary,
	IToolSummary,
} from '../catalog/agent-discovery-types';
import { buildKnowledgeResourceRegistrations } from '../tools/knowledge-resources';
import { buildKnowledgeToolRegistration } from '../tools/knowledge-tool';
import { buildSkillToolRegistration } from '../tools/skill-tool';
import { buildAgentBootstrapPromptRegistration } from '../prompts/agent-bootstrap.prompt';
import { buildSkillPromptRegistrations } from '../prompts/skill-prompts';
import { buildAgentCatalogResourceRegistration } from '../resources/agent-catalog-resource';
import { loadSkills } from '../skills/load-skills';
import { SKILL_MANIFEST_REL } from '../skills/skill-paths';
import { buildSkillCatalog } from '../skills/skill-catalog';
import { buildOverviewToolRegistration } from '../tools/overview-tool';
import { buildAgentCatalogToolRegistration } from '../tools/agent-catalog-tool';
import type {
	IOverviewSnapshot,
	IOverviewToolEntry,
} from '../tools/overview-tool';
import { buildFsToolRegistrations } from '../shared/fs-tools';
import { buildStartPromptRegistration } from '../tools/start-prompt';
import { buildStatusToolRegistration } from '../tools/status-tool';
import { createMetricsRegistry } from '../metrics/metrics-registry';
import { buildMetricsToolRegistration } from '../metrics/metrics-tool';
import { buildValidationMatrixToolRegistration } from '../tools/validation-matrix-tool';
import type { IStatusCollector } from '../contracts/interfaces/status-collector.interface';
import { createWorkspacePathProvider } from '../workspace/create-workspace-path-provider';

export interface IAssembledCliConfig {
	readonly config: IMcpVertexHostConfig;
	readonly loadResult: IPluginLoadResult;
	/** Config-file diagnostic from the SAME read used to assemble (so the
	 * doctor doesn't read the file twice). */
	readonly configDiagnostic: {
		readonly present: boolean;
		readonly issues: readonly string[];
	};
	/** Absolute path of the resolved config file. */
	readonly configPath: string;
}

export interface IAssembleCliDeps {
	/** Provide a custom file reader (default: node:fs.promises.readFile) */
	readFile?: (absolutePath: string) => Promise<string | undefined>;
	/** Provide a custom plugin module importer (default: dynamic import()) */
	import?: (specifier: string) => Promise<{ default: unknown }>;
}

interface IProposalIndexFileEntry {
	readonly id?: string;
	readonly title?: string;
	readonly track?: string;
	readonly status?: string;
	readonly type?: string;
	readonly kind?: string;
	readonly date?: string;
}

interface IProposalIndexFile {
	readonly proposals?: readonly IProposalIndexFileEntry[];
}

const namespaceFromToolName = (name: string): string => {
	const idx = name.indexOf('_');
	return idx === -1 ? name : name.slice(0, idx);
};

const proposalKindFromId = (id: string): IProposalSummary['kind'] => {
	const prefix = id[0]?.toLowerCase();
	if (prefix === 'f') return 'feat';
	if (prefix === 'r') return 'refactor';
	if (prefix === 'c') return 'chore';
	if (prefix === 'd') return 'docs';
	if (prefix === 'q') return 'plan';
	if (prefix === 'a') return 'audit';
	if (prefix === 'x') return 'fix';
	return 'unspecified';
};

const normalizeProposalStatus = (
	status: string | undefined,
): IProposalSummary['status'] => {
	if (
		status === 'ready' ||
		status === 'in-progress' ||
		status === 'review' ||
		status === 'paused' ||
		status === 'done' ||
		status === 'blocked' ||
		status === 'retired'
	) {
		return status;
	}
	return 'unspecified';
};

const readProposalsIndex = async (
	workspaceRoot: string,
	readWorkspaceFile: (absolutePath: string) => Promise<string | undefined>,
): Promise<readonly IProposalSummary[]> => {
	const raw = await readWorkspaceFile(
		join(workspaceRoot, 'docs', 'proposals', 'index.json'),
	);
	if (raw === undefined) return [];
	let parsed: IProposalIndexFile;
	try {
		parsed = JSON.parse(raw) as IProposalIndexFile;
	} catch {
		return [];
	}
	if (!Array.isArray(parsed.proposals)) return [];
	return parsed.proposals
		.filter(
			(
				entry,
			): entry is Required<Pick<IProposalIndexFileEntry, 'id'>> &
				IProposalIndexFileEntry => typeof entry.id === 'string',
		)
		.map((entry) => ({
			id: entry.id,
			title: entry.title ?? entry.id,
			track: entry.track ?? 'unspecified',
			status: normalizeProposalStatus(entry.status),
			kind:
				entry.kind === 'feat' ||
				entry.kind === 'fix' ||
				entry.kind === 'refactor' ||
				entry.kind === 'chore' ||
				entry.kind === 'docs' ||
				entry.kind === 'plan' ||
				entry.kind === 'audit'
					? entry.kind
					: proposalKindFromId(entry.id),
			date: entry.date ?? '',
		}));
};

/**
 * Build the full host config from parsed CLI args: resolve the
 * workspace and core paths (CLI flag > config file > default), load
 * every `--plugins` entry passing each its `mcp-vertex.config.json`
 * options, merge the registrations, and always expose the core
 * meta-tools (scaffold + the hybrid analyze/create_project bootstrap).
 * Pure except for the injectable importer/reader, so it is fully
 * testable.
 */
export const assembleCliConfig = async (
	args: IMcpVertexCliArgs,
	deps: IAssembleCliDeps = {},
): Promise<IAssembledCliConfig> => {
	const workspace = createWorkspacePathProvider(args.workspace);
	const readFile: (absolutePath: string) => Promise<string | undefined> =
		deps.readFile ??
		(async (absolutePath: string) =>
			existsSync(absolutePath)
				? readFileSync(absolutePath, 'utf8')
				: undefined);

	// Config file: --config, else `mcp-vertex.config.json` at the workspace.
	// Read the raw text ONCE and derive both the parsed config and the
	// diagnostic, so the doctor reuses this instead of re-reading.
	const configPath =
		args.configPath ?? join(args.workspace, DEFAULT_CONFIG_FILENAME);
	const rawConfig = await readFile(configPath);
	const fileConfig = parseConfigFile(rawConfig);
	const configDiagnostic = diagnoseConfigFile(rawConfig);
	const configPluginNames = Object.keys(fileConfig.plugins ?? {});

	// Precedence for roots: explicit CLI flag > config file > default.
	const cacheDir =
		args.tokens.cacheDir ??
		fileConfig.cacheDir ??
		DEFAULT_CORE_PATHS.cacheDir;
	const docsDir =
		args.tokens.docsDir ?? fileConfig.docsDir ?? DEFAULT_CORE_PATHS.docsDir;
	const corePaths = { cacheDir, docsDir };
	const corePrefix = args.namespacePrefix ?? 'mcp-vertex';
	const keepLegacy = fileConfig.keepLegacy ?? false;
	// f00052: host-scoped agent_worktree gate. Resolution order is host
	// CLI flag > config file > `false` default. The CLI value is already a
	// tri-state boolean (`undefined` when the flag is absent), so a simple
	// nullish cascade gives the documented precedence with a concrete
	// boolean result that is never `undefined`.
	const agentWorktreeEnabled =
		args.agentWorktree ?? fileConfig.agentWorktree ?? false;

	const buildContext = (pluginName: string): IMcpPluginContext => {
		const pluginConfig = pluginConfigFor(fileConfig, pluginName);
		return {
			workspace,
			corePaths,
			cacheDir: corePaths.cacheDir,
			docsDir: corePaths.docsDir,
			keepLegacy,
			agentWorktreeEnabled,
			pluginCacheDir: joinRel(corePaths.cacheDir, pluginName),
			pluginDocsDir: joinRel(corePaths.docsDir, pluginName),
			namespacePrefix: `${corePrefix}_${pluginConfig.prefix ?? pluginName}`,
			options: pluginConfig.options ?? {},
			args: args.extra,
		};
	};

	const excludedPlugins = new Set(args.excludePlugins);
	const effectivePlugins = [
		...new Set([...args.plugins, ...configPluginNames]),
	].filter((name) => !excludedPlugins.has(name));

	const loadResult = await loadPlugins({
		specifiers: effectivePlugins,
		buildContext,
		import: deps.import ?? nodeDynamicImport,
	});

	const prompts: IPromptRegistration[] = [];
	const resources: IResourceRegistration[] = [];
	const knowledge: IKnowledgeEntry[] = [];
	const pluginToolEntries: IOverviewToolEntry[] = [];
	// Plugin tools, with their id namespaced to the plugin's prefix. Two
	// plugins may legitimately ship a tool with the same internal id (e.g.
	// `status`); the MCP names (`a_status`, `b_status`) never collide, so
	// the registration-order uniqueness check must run on the qualified id,
	// not the raw one.
	const qualifiedPluginTools: IToolRegistration[] = [];

	const onToolCalls: Array<
		(
			toolName: string,
			args: unknown,
			result: unknown,
			error?: unknown,
		) => Promise<void> | void
	> = [];
	const onToolStarts: Array<
		(toolName: string, args: unknown) => Promise<void> | void
	> = [];
	let isAgentStuckFn: IMcpVertexHostConfig['isAgentStuck'];

	for (const { plugin, registrations } of loadResult.loaded) {
		const ns =
			pluginConfigFor(fileConfig, plugin.name).prefix ?? plugin.name;
		if (registrations.prompts) prompts.push(...registrations.prompts);
		if (registrations.resources) resources.push(...registrations.resources);
		if (registrations.knowledge) knowledge.push(...registrations.knowledge);
		if (registrations.onToolCall)
			onToolCalls.push(registrations.onToolCall);
		if (registrations.onToolStart)
			onToolStarts.push(registrations.onToolStart);
		if (registrations.isAgentStuck)
			isAgentStuckFn = registrations.isAgentStuck;
		for (const tool of registrations.tools ?? []) {
			// Every plugin tool is qualified with the host's core namespace
			// prefix (`mcp-vertex` by default) followed by the plugin's own
			// prefix. This makes the tool owner discoverable at a glance
			// when several MCP servers are loaded side by side, and keeps
			// the in-plugin uniqueness guarantee of `${ns}_${tool.id}`.
			const qualifiedId = `${corePrefix}_${ns}_${tool.id}`;
			pluginToolEntries.push({
				name: qualifiedId,
				summary: tool.summary,
				tags: tool.tags,
				...(tool.effects ? { effects: tool.effects } : {}),
			});
			qualifiedPluginTools.push({
				...tool,
				id: qualifiedId,
				// The i18n catalogue key follows the same qualification as
				// the MCP id, so `apps/web/src/i18n/tools/<key>.ts` files
				// are looked up under the fully-qualified name.
				...(tool.descriptionKey !== undefined
					? { descriptionKey: `${corePrefix}_${tool.descriptionKey}` }
					: {}),
				// A same-plugin anchor must point at the qualified id too.
				...(tool.registerAfter !== undefined
					? {
							registerAfter: `${corePrefix}_${ns}_${tool.registerAfter}`,
						}
					: {}),
			});
		}
	}

	const validationMatrix = fileConfig.validationMatrix ?? { scopes: {} };
	// Skill manifest location is defined once in `skill-paths.ts`
	// (`packages/core/skills/manifest.json`). We still fall back to the legacy
	// `docs/<docsDir>/skills/manifest.json` and the bare `<workspace>/skills`
	// layouts so downstream projects (and existing fixtures) that have not yet
	// migrated keep resolving their skills.
	const configuredSkills = await loadSkills(
		join(args.workspace, ...SKILL_MANIFEST_REL.split('/')),
		args.serverVersion,
	);
	const legacyDocsSkills =
		configuredSkills.length > 0
			? configuredSkills
			: await loadSkills(
					join(args.workspace, docsDir, 'skills', 'manifest.json'),
					args.serverVersion,
				);
	const skillBundles =
		legacyDocsSkills.length > 0
			? legacyDocsSkills
			: await loadSkills(
					join(args.workspace, 'skills', 'manifest.json'),
					args.serverVersion,
				);
	// Build the compact, actionable skill catalog once (f00065 slice-B): read
	// each SKILL.md a single time to extract its frontmatter "what + when to
	// use" line, then keep only compact rows. Bodies are loaded on demand via
	// the `skill` tool, never pushed to context by default.
	const skillCatalog = await buildSkillCatalog(
		args.workspace,
		skillBundles,
		async (absPath) => {
			const body = await readFile(absPath);
			if (body === undefined)
				throw new Error(`skill body not found: ${absPath}`);
			return body;
		},
	);
	const skillSummaries: readonly ISkillSummary[] = skillCatalog.entries.map(
		(entry) => ({
			id: entry.id,
			version: entry.version,
			minCoreVersion: entry.minCoreVersion,
			summary: entry.description,
			appliesTo: [...entry.appliesTo],
			tags: [...entry.tags],
			bodyPath: entry.bodyPath,
		}),
	);
	const proposalSummaries = await readProposalsIndex(
		args.workspace,
		readFile,
	);
	const isLoaded = (name: string): boolean =>
		loadResult.loaded.some((entry) => entry.plugin.name === name);
	const hasProposals = isLoaded('proposals');
	const hasRules = isLoaded('rules');
	const rulesClause = hasRules
		? ' ALWAYS write new or modified code already compliant with the active rules (rules_get_rules) — it is the default, no need to be told.'
		: '';
	const recommendedNextAction =
		(hasProposals
			? `Call ${corePrefix}_overview, then ${corePrefix}_proposals_auto_work to start working.`
			: `Call ${corePrefix}_analyze_project to see what this project needs.`) +
		rulesClause;

	// Core meta-tools. `overview` first so it is the obvious entry point.
	// `let` so the (lazily called) snapshot closure can read the final list.
	let coreTools: IToolRegistration[] = [];
	let catalogToolEntries: readonly IToolSummary[] = [];
	const catalogSources = {
		tools: () => catalogToolEntries,
		skills: () => skillSummaries,
		proposals: () => proposalSummaries,
	};
	const buildSnapshot = (): IOverviewSnapshot => ({
		server: { name: args.serverName, version: args.serverVersion },
		namespacePrefix: corePrefix,
		corePaths,
		pluginDiagnostic: (() => {
			const missingPlugins = effectivePlugins.filter(
				(name) =>
					!loadResult.loaded.some(
						(entry) => entry.plugin.name === name,
					),
			);
			const missingReasonsEntries = missingPlugins
				.map((name): [string, string] | undefined => {
					const error = loadResult.errors.find(
						(candidate) => candidate.specifier === name,
					);
					return error === undefined
						? undefined
						: [name, error.message];
				})
				.filter(
					(entry): entry is [string, string] => entry !== undefined,
				);
			return {
				requested: effectivePlugins,
				loaded: loadResult.loaded.map((entry) => entry.plugin.name),
				missing: missingPlugins,
				...(missingReasonsEntries.length > 0
					? {
							missingReasons: Object.fromEntries(
								missingReasonsEntries,
							),
						}
					: {}),
				configPlugins: configPluginNames,
				errors: loadResult.errors.length,
			};
		})(),
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
				...(reg.effects ? { effects: reg.effects } : {}),
			})),
			...pluginToolEntries,
		],
		knowledge: knowledge.map((entry) => ({
			id: entry.id,
			title: entry.title,
		})),
		recommendedNextAction,
	});

	// Built-in collector so `<prefix>_status` is useful even without host
	// collectors: reports the live plugin-load result. A programmatic host
	// adds its own collectors (e.g. a game loop) via the same tool.
	const coreCollector: IStatusCollector = {
		id: 'mcp-vertex',
		collect: async () => ({
			requestedPlugins: effectivePlugins,
			loadedPlugins: loadResult.loaded.map((e) => e.plugin.name),
			pluginErrors: loadResult.errors.length,
		}),
	};

	// Metrics registry instruments every tool; the `metrics` tool reads it
	// and can persist timestamped snapshots under `<cacheDir>/metrics/`.
	const metricsRegistry = createMetricsRegistry();
	const metricsDirAbs = workspace.resolve(
		joinRel(corePaths.cacheDir, 'metrics'),
	);

	coreTools = [
		buildOverviewToolRegistration(corePrefix, buildSnapshot),
		buildAgentCatalogToolRegistration(corePrefix, {
			sources: catalogSources,
			server: {
				name: args.serverName,
				version: args.serverVersion,
				namespacePrefix: corePrefix,
			},
		}),
		buildKnowledgeToolRegistration(corePrefix, () => knowledge),
		buildSkillToolRegistration(corePrefix, () => skillCatalog),
		buildValidationMatrixToolRegistration(
			corePrefix,
			() => validationMatrix,
		),
		buildStatusToolRegistration(corePrefix, [coreCollector]),
		buildMetricsToolRegistration(
			corePrefix,
			metricsRegistry,
			metricsDirAbs,
		),
		...buildBootstrapToolRegistrations({
			workspace,
			namespacePrefix: corePrefix,
			cacheDir: corePaths.cacheDir,
			...(fileConfig.bootstrap?.patternOverrides !== undefined
				? { patternOverrides: fileConfig.bootstrap.patternOverrides }
				: {}),
		}),
		...buildFsToolRegistrations({
			namespacePrefix: corePrefix,
			workspaceRootAbs: workspace.root,
		}),
		buildScaffoldToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
			keepLegacy,
			projectName: args.serverName,
			projectPackageName: '@mcp-vertex/core',
		}),
	];

	// Core tools keep their bare id (single namespace); plugin tools are
	// already qualified above so the uniqueness check is per-namespace.
	const tools: IToolRegistration[] = [...coreTools, ...qualifiedPluginTools];
	catalogToolEntries = tools.map((tool) => {
		const name = tool.id.includes('_')
			? tool.id
			: `${corePrefix}_${tool.id}`;
		return {
			name,
			plugin: namespaceFromToolName(name),
			...(tool.summary !== undefined ? { summary: tool.summary } : {}),
			...(tool.tags !== undefined ? { tags: [...tool.tags] } : {}),
			...(tool.effects !== undefined
				? { effects: [...tool.effects] }
				: {}),
		};
	});

	// Surface knowledge as native MCP resources too (list/read/cache).
	resources.push(...buildKnowledgeResourceRegistrations(knowledge));
	resources.push(
		buildAgentCatalogResourceRegistration({
			mode: 'compact',
			sources: catalogSources,
			server: {
				name: args.serverName,
				version: args.serverVersion,
				namespacePrefix: corePrefix,
			},
		}),
		buildAgentCatalogResourceRegistration({
			mode: 'full',
			sources: catalogSources,
			server: {
				name: args.serverName,
				version: args.serverVersion,
				namespacePrefix: corePrefix,
			},
		}),
	);

	// A "start" workflow prompt for one-click orientation in clients.
	prompts.unshift(
		buildAgentBootstrapPromptRegistration(corePrefix, {
			sources: catalogSources,
			server: {
				name: args.serverName,
				version: args.serverVersion,
				namespacePrefix: corePrefix,
			},
		}),
		buildStartPromptRegistration(corePrefix, () => recommendedNextAction),
	);

	// f00065 S5 (E): expose every advertised skill as a `/`-invocable prompt
	// (`<prefix>_skill_<id>`), so MCP hosts list skills under their trigger
	// character. Bodies load lazily via the catalog, so this stays cheap.
	prompts.push(
		...buildSkillPromptRegistrations(corePrefix, () => skillCatalog),
	);

	const config: IMcpVertexHostConfig = {
		metadata: {
			name: args.serverName,
			version: args.serverVersion,
			description: 'mcp-vertex server (CLI plugin loader).',
		},
		namespacePrefix: corePrefix,
		workspace,
		corePaths,
		keepLegacy,
		agentWorktreeEnabled,
		validationMatrix,
		knowledge,
		metricsRegistry,
		extraTools: tools,
		extraPrompts: prompts,
		extraResources: resources,
		...(onToolStarts.length > 0
			? {
					onToolStart: async (toolName, toolArgs) => {
						for (const handler of onToolStarts) {
							try {
								await handler(toolName, toolArgs);
							} catch (e) {
								process.stderr.write(
									`[mcp-vertex] onToolStart error: ${e instanceof Error ? e.message : String(e)}\n`,
								);
							}
						}
					},
				}
			: {}),
		...(onToolCalls.length > 0
			? {
					onToolCall: async (toolName, toolArgs, result, error) => {
						for (const handler of onToolCalls) {
							try {
								await handler(
									toolName,
									toolArgs,
									result,
									error,
								);
							} catch (e) {
								process.stderr.write(
									`[mcp-vertex] onToolCall error: ${e instanceof Error ? e.message : String(e)}\n`,
								);
							}
						}
					},
				}
			: {}),
		...(isAgentStuckFn !== undefined
			? { isAgentStuck: isAgentStuckFn }
			: {}),
	};

	return { config, loadResult, configDiagnostic, configPath };
};

export interface IDoctorReport {
	readonly ok: boolean;
	readonly configPath: string;
	readonly config: {
		readonly present: boolean;
		readonly issues: readonly string[];
	};
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
	args: IMcpVertexCliArgs,
	deps: IAssembleCliDeps = {},
): Promise<IDoctorReport> => {
	// Single source of truth: assembleCliConfig already read + diagnosed the
	// config file from one read; reuse that instead of reading it again.
	const { config, loadResult, configDiagnostic, configPath } =
		await assembleCliConfig(args, deps);
	const configDiag = configDiagnostic;

	// Assemble the REAL server (no stdio) to catch registration errors
	// (e.g. duplicate tool ids) that a config-only check would miss.
	let assembles = true;
	let assemblyError: string | undefined;
	try {
		await createMcpProject(config);
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
		paths: config.corePaths ?? {
			cacheDir: args.cacheDir,
			docsDir: args.docsDir,
		},
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
 * writes into the repo itself. Skipped by `--mcp-project-create=false`.
 * If a server already exists, the blueprint's notes explain how to
 * integrate it with mcp-vertex organically.
 *
 * r00003 S1 (F-002, S + D): the existence check + mkdir + writeFile
 * triple was a race condition with two concurrent first-starts able to
 * both pass the check and clobber each other's bytes. The body now
 * delegates to `IBlueprintWriter.writeOnce`, which serializes the
 * existence check + write under a `withFileMutex` keyed by the
 * absolute path, and uses `writeFileAtomic` so readers never observe
 * a half-written file.
 */
export const prepareServerBlueprintOnStart = async (
	args: IMcpVertexCliArgs,
	// The already-resolved cacheDir (CLI flag → config file → default). Passing
	// it avoids drift: the blueprint must land under the SAME cacheDir as the
	// rest of the store, including when it comes from mcp-vertex.config.json.
	resolvedCacheDir?: string,
	// Dependency-injection seam for tests and alternative storage
	// (e.g. an in-memory writer). Defaults to the filesystem-backed
	// implementation keyed by the workspace root.
	writer: IBlueprintWriter = createFileSystemBlueprintWriter(),
): Promise<{ written: boolean; path: string }> => {
	const cacheDir =
		resolvedCacheDir ?? args.tokens.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir;
	const relPath = `${cacheDir.replace(/\/+$/, '')}/bootstrap/blueprint.json`;

	// Idempotency is the writer's responsibility (SRP): `writeOnce`
	// repeats the existence/corruption check inside its mutex, so a
	// pre-check here would only duplicate that policy and re-introduce
	// the TOCTOU window this slice removed.
	const reader = createWorkspaceFileReader({
		root: args.workspace,
		resolve: (rel) => join(args.workspace, rel),
	});
	const analysis = await analyzeProject(reader);
	const blueprint = buildServerBlueprint(analysis, {
		tests: args.mcpProjectTests,
	});
	return writer.writeOnce(args.workspace, relPath, {
		generatedAt: new Date().toISOString(),
		blueprint,
	});
};

/** Entry point for the `mcp-vertex` bin. */
// ---------------------------------------------------------------------------
// `--verbose` observability
// ---------------------------------------------------------------------------

export interface IAssemblyDiagnostics {
	readonly workspace: string;
	readonly cacheDir: string;
	readonly docsDir: string;
	readonly plugins: {
		readonly requested: readonly string[];
		readonly loaded: ReadonlyArray<{
			readonly name: string;
			readonly version?: string;
		}>;
		readonly errors: readonly string[];
	};
	readonly counts: {
		readonly tools: number;
		readonly prompts: number;
		readonly resources: number;
	};
	readonly registrationOrder: readonly string[];
}

/** Pure: assemble a diagnostics snapshot of what the server will expose. */
export const buildAssemblyDiagnostics = (
	args: IMcpVertexCliArgs,
	loadResult: IPluginLoadResult,
	config: IMcpVertexHostConfig,
	registrationOrder: readonly string[],
): IAssemblyDiagnostics => ({
	workspace: args.workspace,
	cacheDir: args.cacheDir,
	docsDir: args.docsDir,
	plugins: {
		requested: args.plugins,
		loaded: loadResult.loaded.map((e) => ({
			name: e.plugin.name,
			...(e.plugin.version !== undefined
				? { version: e.plugin.version }
				: {}),
		})),
		errors: loadResult.errors.map((e) => e.message),
	},
	counts: {
		tools: config.extraTools?.length ?? 0,
		prompts: config.extraPrompts?.length ?? 0,
		resources: config.extraResources?.length ?? 0,
	},
	registrationOrder,
});

/** Pure: render diagnostics as stderr lines (stdout is the MCP transport). */
export const formatVerbose = (d: IAssemblyDiagnostics): string => {
	const loaded = d.plugins.loaded
		.map((p) => (p.version ? `${p.name}@${p.version}` : p.name))
		.join(', ');
	return `${[
		`[mcp-vertex] verbose: workspace=${d.workspace} cacheDir=${d.cacheDir} docsDir=${d.docsDir}`,
		`[mcp-vertex] verbose: plugins requested=[${d.plugins.requested.join(', ')}] loaded=[${loaded}] errors=${d.plugins.errors.length}`,
		`[mcp-vertex] verbose: counts tools=${d.counts.tools} prompts=${d.counts.prompts} resources=${d.counts.resources}`,
		`[mcp-vertex] verbose: registrationOrder=[${d.registrationOrder.join(', ')}]`,
	].join('\n')}\n`;
};

export const runCli = async (
	argv: readonly string[],
	cwd: string,
): Promise<void> => {
	// `init`: merge the mcp-vertex server into the detected IDE configs and exit.
	if (argv[0] === 'init') {
		const { runInit } = await import('./run-init');
		await runInit(argv.slice(1), cwd);
		return;
	}

	const args = parseCliArgs(argv, cwd);

	// `--check`/`--doctor`: print a diagnostic report and exit (no stdio).
	if (args.tokens.check !== undefined || args.tokens.doctor !== undefined) {
		const report = await runDoctor(args);
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		if (!report.ok) process.exitCode = 1;
		return;
	}

	const { config, loadResult } = await assembleCliConfig(args);
	for (const error of loadResult.errors) {
		// stderr only: stdout is the MCP stdio transport.
		process.stderr.write(`[mcp-vertex] plugin error: ${error.message}\n`);
	}
	const assembled = await createMcpProject(config);
	// `--verbose`: dump an assembly diagnostic to stderr before going live.
	if (args.tokens.verbose !== undefined) {
		process.stderr.write(
			formatVerbose(
				buildAssemblyDiagnostics(
					args,
					loadResult,
					config,
					assembled.registrationOrder,
				),
			),
		);
	}
	await assembled.start();

	// Fast boot: the one-time server blueprint is prepared AFTER the server
	// is live and off the critical path — analysing the repo + writing the
	// cache file must never delay the first MCP response. Best-effort.
	if (args.mcpProjectCreate) {
		void prepareServerBlueprintOnStart(args, config.corePaths?.cacheDir)
			.then((result) => {
				if (result.written) {
					process.stderr.write(
						`[mcp-vertex] wrote a project MCP server blueprint to ${result.path}; review it or call mcp-vertex_plan_mcp_project.\n`,
					);
				}
			})
			.catch(() => undefined);
	}
};
