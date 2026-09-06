/**
 * assemble-core-tools.ts — r00009: the core tool-surface composition,
 * extracted verbatim from `assembleCliConfig`. Builds the overview
 * snapshot closure, the configuration-center snapshot, the discovery
 * catalog sources, every core meta-tool registration, the knowledge/
 * catalog resources and the orientation prompts. Mutates the shared
 * `prompts` / `resources` arrays in place (same contract the inline
 * block had) and returns the composed tool list plus the metrics
 * registry the host config wires in.
 */
import { buildAdoptProjectToolRegistration } from '../adopt/adopt-project.tool';
import { buildBootstrapToolRegistrations } from '../bootstrap/index';
import { buildInitConfigToolRegistration } from '../bootstrap/init-config-tool';
import { createWorkspaceFileReader } from '../bootstrap/workspace-file-reader';
import type {
	ISkillSummary,
	IToolSummary,
} from '../catalog/agent-discovery-types';
import type {
	IConfigurationArtifact,
	IConfigurationPlugin,
	IConfigurationCenterSnapshot,
} from '../contracts/interfaces/configuration-center.interface';
import type { ICorePaths } from '../contracts/interfaces/core-paths.interface';
import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type { IProviderSummary } from '../contracts/interfaces/provider-capabilities.interface';
import type { IStatusCollector } from '../contracts/interfaces/status-collector.interface';
import type {
	IPromptRegistration,
	IResourceRegistration,
	IToolRegistration,
} from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IToolSurfaceRuntimeAccess } from '../contracts/interfaces/tool-surface.interface';
import {
	buildConfigurationCenterSnapshot,
	serializeConfigurationSchema,
} from '../configuration-center/configuration-center';
import { createMetricsRegistry } from '../metrics/metrics-registry';
import { buildMetricsToolRegistration } from '../metrics/metrics-tool';
import {
	CONFIG_FILE_SCHEMA,
	pluginConfigFor,
} from '../plugins/load-config-file';
import type { IDelendaiConfigFile } from '../plugins/load-config-file';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import type { IDelendaiCliArgs } from '../plugins/parse-cli-args';
import { buildAgentBootstrapPromptRegistration } from '../prompts/agent-bootstrap.prompt';
import { buildSkillPromptRegistrations } from '../prompts/skill-prompts';
import { buildAgentCatalogResourceRegistration } from '../resources/agent-catalog-resource';
import { buildCodeMapResourceRegistration } from '../code-map/resource';
import { buildScaffoldToolRegistration } from '../scaffold/scaffold-tool';
import { buildCreatePluginToolRegistration } from '../scaffold/create-plugin.tool';
import {
	buildProjectPluginsCreateToolRegistration,
	buildProjectPluginsInspectToolRegistration,
	buildProjectPluginsRepairToolRegistration,
} from '../scaffold/project-plugins';
import { buildPluginAddRegistration } from '../registry/plugin-add.tool';
import { buildPluginSearchRegistration } from '../registry/plugin-search.tool';
import { buildFsToolRegistrations } from '../shared/fs-tools';
import { joinRel } from '../shared/paths';
import type { buildSkillCatalog } from '../skills/skill-catalog';
import { buildAgentCatalogToolRegistration } from '../tools/agent-catalog-tool';
import { buildConfigurationCenterToolRegistration } from '../tools/configuration-center.tool';
import { buildKnowledgeResourceRegistrations } from '../tools/knowledge-resources';
import { buildKnowledgeToolRegistration } from '../tools/knowledge-tool';
import type {
	IOverviewSnapshot,
	IOverviewToolEntry,
} from '../tools/overview-tool';
import { buildOverviewToolRegistration } from '../tools/overview-tool';
import { buildSkillToolRegistration } from '../tools/skill-tool';
import { buildStartPromptRegistration } from '../tools/start-prompt';
import { buildStatusToolRegistration } from '../tools/status-tool';
import {
	buildPluginActivateToolRegistration,
	buildPluginDeactivateToolRegistration,
	buildProjectContextToolRegistration,
	buildToolSearchToolRegistration,
} from '../tools/tool-surface.tool';
import { findUnusedActivePlugins } from '../tools/unused-active-plugins';
import { buildValidationMatrixToolRegistration } from '../tools/validation-matrix-tool';
import { buildCompactRouterToolRegistration } from '../tools/vertex-router.tool';
import { buildCacheReconcileToolRegistration } from '../tools/cache-reconcile.tool';
import type { assemblePlugins } from './assemble-plugins';
import type { assembleSkills } from './assemble-skills';

type TPluginPhase = Awaited<ReturnType<typeof assemblePlugins>>;
type TSkillsPhase = Awaited<ReturnType<typeof assembleSkills>>;

export interface IAssembleCoreToolsInput {
	readonly args: IDelendaiCliArgs;
	readonly corePrefix: string;
	readonly corePaths: ICorePaths;
	readonly workspace: IWorkspacePathProvider;
	readonly fileConfig: IDelendaiConfigFile;
	readonly configDiagnostic: {
		readonly present: boolean;
		readonly issues: readonly string[];
	};
	readonly configPluginNames: readonly string[];
	readonly effectivePlugins: readonly string[];
	readonly activationReport: TPluginPhase['activationReport'];
	readonly loadResult: IPluginLoadResult;
	readonly pluginSummaries: readonly {
		readonly name: string;
		readonly version?: string | undefined;
		readonly describe?: string | undefined;
	}[];
	readonly moduleLoading: 'lazy' | 'eager';
	readonly pluginToolEntries: IOverviewToolEntry[];
	readonly qualifiedPluginTools: IToolRegistration[];
	readonly knowledge: IKnowledgeEntry[];
	readonly skillSummaries: readonly ISkillSummary[];
	readonly skillCatalog: Awaited<ReturnType<typeof buildSkillCatalog>>;
	readonly proposalSummaries: TSkillsPhase['proposalSummaries'];
	readonly validationMatrix: TSkillsPhase['validationMatrix'];
	readonly recommendedNextAction: string;
	readonly configurationPlugins: IConfigurationPlugin[];
	readonly configurationArtifacts: IConfigurationArtifact[];
	readonly fsAuthorizedRoots: readonly string[];
	readonly keepLegacy: boolean;
	readonly toolSurfaceRuntime: IToolSurfaceRuntimeAccess;
	/** Mutated in place: orientation prompts are prepended/appended. */
	readonly prompts: IPromptRegistration[];
	/** Mutated in place: knowledge + catalog resources are appended. */
	readonly resources: IResourceRegistration[];
	readonly cacheReconcile: (
		apply: boolean,
	) => Promise<
		import('../cache/cache-layout-bootstrap').ICacheLayoutBootstrapResult
	>;
}

export interface IAssembleCoreToolsResult {
	readonly tools: IToolRegistration[];
	readonly catalogToolEntries: readonly IToolSummary[];
	readonly metricsRegistry: ReturnType<typeof createMetricsRegistry>;
	readonly configurationSnapshot: IConfigurationCenterSnapshot;
}

export const assembleCoreTools = (
	input: IAssembleCoreToolsInput,
): IAssembleCoreToolsResult => {
	const {
		args,
		corePrefix,
		corePaths,
		workspace,
		fileConfig,
		configDiagnostic,
		configPluginNames,
		effectivePlugins,
		activationReport,
		loadResult,
		pluginSummaries,
		moduleLoading,
		pluginToolEntries,
		qualifiedPluginTools,
		knowledge,
		skillSummaries,
		skillCatalog,
		proposalSummaries,
		validationMatrix,
		recommendedNextAction,
		configurationPlugins,
		configurationArtifacts,
		fsAuthorizedRoots,
		keepLegacy,
		toolSurfaceRuntime,
		prompts,
		resources,
		cacheReconcile,
	} = input;
	// Core meta-tools. `overview` first so it is the obvious entry point.
	// `let` so the (lazily called) snapshot closure can read the final list.
	let coreTools: IToolRegistration[] = [];
	let catalogToolEntries: readonly IToolSummary[] = [];
	// f00067a S2 — project the config roster to lean summaries for the
	// catalog/overview. `reachable` is a request-time projection of live
	// availability; without the runner's healthcheck wired into assembly it
	// stays the conservative `false` (the orchestrator's
	// `healthcheck_providers` tool is the live source of truth).
	const providerSummaries: ReadonlyArray<IProviderSummary> = (
		fileConfig.providers ?? []
	).map((entry) => ({
		id: entry.id,
		kind: entry.kind,
		modelId: entry.modelId,
		costTier: entry.costTier,
		reachable: false,
		strengths: [...entry.strengths],
	}));
	const configurationSnapshot = buildConfigurationCenterSnapshot({
		configSchema: serializeConfigurationSchema(CONFIG_FILE_SCHEMA) ?? {
			unavailable: true,
		},
		config: fileConfig as Readonly<Record<string, unknown>>,
		plugins: configurationPlugins,
		artifacts: configurationArtifacts,
		unavailableArtifactKinds: ['agent'],
	});
	const catalogSources = {
		tools: () => catalogToolEntries,
		skills: () => skillSummaries,
		proposals: () => proposalSummaries,
		...(providerSummaries.length > 0
			? { providers: () => providerSummaries }
			: {}),
	};
	// S2: when no config file exists at all, orientation names the
	// one call that bootstraps it — the server-side self-init, for hosts
	// with no CLI available. `configDiagnostic.present` is resolved once
	// at boot from a real file read; no I/O here.
	if (!configDiagnostic.present) {
		knowledge.push({
			id: 'no-config-file',
			title: 'No delendai.config.json yet',
			body: [
				'# No delendai.config.json yet',
				'',
				'This workspace has no config file. Call',
				`\`${corePrefix}_adopt_project\` to self-configure the project`,
				'in ONE call: it derives the config, bootstraps the proposals',
				'store and generates the orchestrator + subagent files (dry-run',
				'by default; pass `write: true` to persist — no CLI required).',
				'For just the config, `init_config` is the granular alternative.',
			].join('\n'),
		});
	}
	const buildSnapshot = (): IOverviewSnapshot => ({
		server: { name: args.serverName, version: args.serverVersion },
		namespacePrefix: corePrefix,
		// Include workspaceRoot so the overview tool can ask
		// the tool-surface runtime for getProjectContext (which
		// requires a workspaceRoot) and surface the surface-mode +
		// tool counts the operator asked for.
		workspaceRoot: args.workspace,
		corePaths,
		// S1: config problems (schema violations, dead docsDir/roots)
		// belong in the agent's first orientation call. Omitted when clean
		// so the healthy path pays zero bytes.
		...(configDiagnostic.issues.length > 0
			? { configIssues: configDiagnostic.issues }
			: {}),
		pluginDiagnostic:
			moduleLoading === 'lazy'
				? undefined
				: (() => {
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
								(entry): entry is [string, string] =>
									entry !== undefined,
							);
						// Token economy: the diagnostic only earns its bytes when the
						// requested plugin set diverged from what actually loaded. In the
						// healthy case (nothing missing, no errors) it repeats the plugin
						// name list three times (requested/loaded/configPlugins) on every
						// cold-start `overview` — pure noise, since `plugins` already
						// conveys the active set. Omit it when clean so the divergence, when
						// it happens, is the ONLY reason this block appears.
						if (
							missingPlugins.length === 0 &&
							loadResult.errors.length === 0
						) {
							return undefined;
						}
						return {
							requested: effectivePlugins,
							loaded: loadResult.loaded.map(
								(entry) => entry.plugin.name,
							),
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
		plugins: pluginSummaries,
		tools: [
			...coreTools.map((reg) => ({
				name: `${corePrefix}_${reg.id}`,
				// No plugin (core tool) → grouped under `core` in the compact
				// overview; the stem is the unqualified id.
				id: reg.id,
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
		...(providerSummaries.length > 0
			? { providers: providerSummaries }
			: {}),
		activationReport,
		...(() => {
			const unusedActivePlugins = findUnusedActivePlugins({
				activationReport,
				corePrefix,
				metricsRegistry,
				namespaceForPlugin: (pluginId) =>
					pluginConfigFor(fileConfig, pluginId).prefix ?? pluginId,
			});
			return unusedActivePlugins.length > 0
				? { unusedActivePlugins }
				: {};
		})(),
		recommendedNextAction,
	});

	// Built-in collector so `<prefix>_status` is useful even without host
	// collectors: reports the live plugin-load result. A programmatic host
	// adds its own collectors (e.g. a game loop) via the same tool.
	const coreCollector: IStatusCollector = {
		id: 'delendai',
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
	// Dynamic surface tools are ALWAYS registered.
	const dynamicSurfaceTools = [
		buildProjectContextToolRegistration({
			namespacePrefix: corePrefix,
			runtimeAccess: toolSurfaceRuntime,
			workspaceRoot: workspace.root,
			corePaths,
			configIssues: configDiagnostic.issues,
		}),
		buildToolSearchToolRegistration({
			namespacePrefix: corePrefix,
			runtimeAccess: toolSurfaceRuntime,
		}),
		buildPluginActivateToolRegistration({
			namespacePrefix: corePrefix,
			runtimeAccess: toolSurfaceRuntime,
		}),
		buildPluginDeactivateToolRegistration({
			namespacePrefix: corePrefix,
			runtimeAccess: toolSurfaceRuntime,
		}),
	];

	coreTools = [
		buildOverviewToolRegistration(
			corePrefix,
			buildSnapshot,
			toolSurfaceRuntime,
		),
		buildConfigurationCenterToolRegistration(
			corePrefix,
			() => configurationSnapshot,
		),
		buildAgentCatalogToolRegistration(corePrefix, {
			sources: catalogSources,
			server: {
				name: args.serverName,
				version: args.serverVersion,
				namespacePrefix: corePrefix,
			},
		}),
		buildKnowledgeToolRegistration(
			corePrefix,
			() => knowledge,
			toolSurfaceRuntime,
		),
		...dynamicSurfaceTools,
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
			authorizedRoots: fsAuthorizedRoots,
		}),
		buildScaffoldToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
			keepLegacy,
			projectName: args.serverName,
			projectPackageName: '@delendai/core',
		}),
		// S4: `create_plugin` is a SEPARATE IToolRegistration, not a
		// nested call inside `scaffold.register`. The fake MCP server in
		// `tools/scripts/lib/test-mcp-server.ts` captures schemas via a
		// single closure per tool — a nested register would overwrite the
		// `scaffold` schemas and break `bun run verify:tools`.
		buildCreatePluginToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
		}),
		buildProjectPluginsCreateToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
		}),
		buildProjectPluginsInspectToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
		}),
		buildProjectPluginsRepairToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
		}),
		// S2: `plugin_add` MCP tool. Returns the install + wire + config
		// recipe for the agent to execute; the recipe is data so the tool
		// stays pure (no subprocess, no fs, no config write).
		buildPluginAddRegistration({
			namespacePrefix: corePrefix,
		}),
		// S3: `plugin_search` MCP tool. Read-only registry search;
		// pairs with plugin_add so the agent can discover first.
		buildPluginSearchRegistration({
			namespacePrefix: corePrefix,
			...(fileConfig.pluginRegistry?.communitySources !== undefined
				? { sources: fileConfig.pluginRegistry.communitySources }
				: {}),
		}),
		// S2: the server-side self-init — any MCP client can derive
		// (and, with write:true, persist) delendai.config.json without
		// the CLI.
		buildInitConfigToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
			reader: createWorkspaceFileReader(workspace),
		}),
		buildCacheReconcileToolRegistration({
			namespacePrefix: corePrefix,
			reconcile: cacheReconcile,
		}),
		// S1: the one-call adoption orchestrator — composes config
		// derivation + proposals-store bootstrap + host agent scaffold.
		buildAdoptProjectToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
			corePaths,
			reader: createWorkspaceFileReader(workspace),
		}),
		// The compact router is ALWAYS registered; the runtime's
		// `applySurfaceMode` decides whether to expose it. In native
		// mode it stays hidden; in managed/adaptive/compact it is the fallback
		// entry point for tools outside the bootstrap set.
		buildCompactRouterToolRegistration({
			namespacePrefix: corePrefix,
			runtimeAccess: toolSurfaceRuntime,
		}),
	];

	// Core tools keep their bare id (single namespace); plugin tools are
	// already qualified above so the uniqueness check is per-namespace.
	const tools: IToolRegistration[] = [...coreTools, ...qualifiedPluginTools];
	// The discovery catalog reuses the SAME name+plugin the overview snapshot
	// carries, rather than re-deriving them from the qualified id string. The
	// old parse-the-name approach was doubly wrong: `id.includes('_')` treated
	// every core tool with an underscore in its id (`agent_catalog`,
	// `fs_read`, `get_validation_matrix`, …) as already-qualified and dropped
	// the `delendai_` prefix — so the catalog advertised a NON-CALLABLE name
	// — and `namespaceFromToolName` split on the FIRST `_`, reporting the host
	// segment (`delendai`) as the plugin for every plugin tool. Carrying the
	// values explicitly (core tools → the host prefix; plugin tools → their
	// resolved `ns`) makes both correct by construction.
	catalogToolEntries = [
		...coreTools.map((reg) => ({
			name: `${corePrefix}_${reg.id}`,
			plugin: corePrefix,
			...(reg.summary !== undefined ? { summary: reg.summary } : {}),
			...(reg.tags !== undefined ? { tags: [...reg.tags] } : {}),
			...(reg.effects !== undefined ? { effects: [...reg.effects] } : {}),
		})),
		...pluginToolEntries.map((entry) => ({
			name: entry.name,
			plugin: entry.plugin ?? corePrefix,
			...(entry.summary !== undefined ? { summary: entry.summary } : {}),
			...(entry.tags !== undefined ? { tags: [...entry.tags] } : {}),
			...(entry.effects !== undefined
				? { effects: [...entry.effects] }
				: {}),
		})),
	];

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
		// Structural map resource (Track H) so any
		// client can fetch the repo-wide orientation in one round
		// trip (packages, plugins, hotspots).
		buildCodeMapResourceRegistration(),
	);

	// A "start" workflow prompt for one-click orientation in clients.
	prompts.unshift(
		buildAgentBootstrapPromptRegistration(corePrefix, {
			sources: catalogSources,
			...(fileConfig.core?.agentPolicy !== undefined
				? { agentPolicy: fileConfig.core.agentPolicy }
				: {}),
			server: {
				name: args.serverName,
				version: args.serverVersion,
				namespacePrefix: corePrefix,
			},
		}),
		buildStartPromptRegistration(corePrefix, () => recommendedNextAction),
	);

	// S5 (E): expose every advertised skill as a `/`-invocable prompt
	// (`<prefix>_skill_<id>`), so MCP hosts list skills under their trigger
	// character. Bodies load lazily via the catalog, so this stays cheap.
	prompts.push(
		...buildSkillPromptRegistrations(corePrefix, () => skillCatalog),
	);

	return {
		tools,
		catalogToolEntries,
		metricsRegistry,
		configurationSnapshot,
	};
};
