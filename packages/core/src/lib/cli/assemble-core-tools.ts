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
import {
	buildConfigurationCenterSnapshot,
	serializeConfigurationSchema,
} from '../configuration-center/configuration-center';
import { createMetricsRegistry } from '../metrics/metrics-registry';
import { buildMetricsToolRegistration } from '../metrics/metrics-tool';
import { CONFIG_FILE_SCHEMA } from '../plugins/load-config-file';
import type { IMcpVertexConfigFile } from '../plugins/load-config-file';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import type { IMcpVertexCliArgs } from '../plugins/parse-cli-args';
import { buildAgentBootstrapPromptRegistration } from '../prompts/agent-bootstrap.prompt';
import { buildSkillPromptRegistrations } from '../prompts/skill-prompts';
import { buildAgentCatalogResourceRegistration } from '../resources/agent-catalog-resource';
import { buildScaffoldToolRegistration } from '../scaffold/scaffold-tool';
import { buildCreatePluginToolRegistration } from '../scaffold/create-plugin.tool';
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
import { buildValidationMatrixToolRegistration } from '../tools/validation-matrix-tool';
import type { assemblePlugins } from './assemble-plugins';
import type { assembleSkills } from './assemble-skills';

type TPluginPhase = Awaited<ReturnType<typeof assemblePlugins>>;
type TSkillsPhase = Awaited<ReturnType<typeof assembleSkills>>;

export interface IAssembleCoreToolsInput {
	readonly args: IMcpVertexCliArgs;
	readonly corePrefix: string;
	readonly corePaths: ICorePaths;
	readonly workspace: IWorkspacePathProvider;
	readonly fileConfig: IMcpVertexConfigFile;
	readonly configDiagnostic: {
		readonly present: boolean;
		readonly issues: readonly string[];
	};
	readonly configPluginNames: readonly string[];
	readonly effectivePlugins: readonly string[];
	readonly activationReport: TPluginPhase['activationReport'];
	readonly loadResult: IPluginLoadResult;
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
	/** Mutated in place: orientation prompts are prepended/appended. */
	readonly prompts: IPromptRegistration[];
	/** Mutated in place: knowledge + catalog resources are appended. */
	readonly resources: IResourceRegistration[];
}

export interface IAssembleCoreToolsResult {
	readonly tools: IToolRegistration[];
	readonly catalogToolEntries: readonly IToolSummary[];
	readonly metricsRegistry: ReturnType<typeof createMetricsRegistry>;
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
		prompts,
		resources,
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
	// f00117 S2: when no config file exists at all, orientation names the
	// one call that bootstraps it — the server-side self-init, for hosts
	// with no CLI available. `configDiagnostic.present` is resolved once
	// at boot from a real file read; no I/O here.
	if (!configDiagnostic.present) {
		knowledge.push({
			id: 'no-config-file',
			title: 'No mcp-vertex.config.json yet',
			body: [
				'# No mcp-vertex.config.json yet',
				'',
				'This workspace has no config file. Call',
				`\`${corePrefix}_init_config\` to see a recommended config`,
				'derived from this project (dry-run by default); pass',
				'`write: true` to persist it — no CLI required.',
			].join('\n'),
		});
	}
	const buildSnapshot = (): IOverviewSnapshot => ({
		server: { name: args.serverName, version: args.serverVersion },
		namespacePrefix: corePrefix,
		corePaths,
		// f00109 S1: config problems (schema violations, dead docsDir/roots)
		// belong in the agent's first orientation call. Omitted when clean
		// so the healthy path pays zero bytes.
		...(configDiagnostic.issues.length > 0
			? { configIssues: configDiagnostic.issues }
			: {}),
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
			// Token economy: the diagnostic only earns its bytes when the
			// requested plugin set diverged from what actually loaded. In the
			// healthy case (nothing missing, no errors) it repeats the plugin
			// name list three times (requested/loaded/configPlugins) on every
			// cold-start `overview` — pure noise, since `plugins` already
			// conveys the active set. Omit it when clean so the divergence, when
			// it happens, is the ONLY reason this block appears.
			if (missingPlugins.length === 0 && loadResult.errors.length === 0) {
				return undefined;
			}
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
			authorizedRoots: fsAuthorizedRoots,
		}),
		buildScaffoldToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
			keepLegacy,
			projectName: args.serverName,
			projectPackageName: '@mcp-vertex/core',
		}),
		// f00120 S4: `create_plugin` is a SEPARATE IToolRegistration, not a
		// nested call inside `scaffold.register`. The fake MCP server in
		// `tools/scripts/lib/test-mcp-server.ts` captures schemas via a
		// single closure per tool — a nested register would overwrite the
		// `scaffold` schemas and break `bun run verify:tools`.
		buildCreatePluginToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
		}),
		// f00117 S2: the server-side self-init — any MCP client can derive
		// (and, with write:true, persist) mcp-vertex.config.json without
		// the CLI.
		buildInitConfigToolRegistration({
			namespacePrefix: corePrefix,
			workspace,
			reader: createWorkspaceFileReader(workspace),
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
	// the `mcp-vertex_` prefix — so the catalog advertised a NON-CALLABLE name
	// — and `namespaceFromToolName` split on the FIRST `_`, reporting the host
	// segment (`mcp-vertex`) as the plugin for every plugin tool. Carrying the
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

	return { tools, catalogToolEntries, metricsRegistry };
};
