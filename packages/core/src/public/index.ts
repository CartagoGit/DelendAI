/**
 * Public surface of `@mcp-vertex/core`. This barrel is the ONLY
 * stable import surface of the package. Everything under `src/lib` is
 * internal and may change without notice.
 *
 * The core is project-agnostic and knows nothing about proposals,
 * swarms or any domain. Domain behaviour ships as plugins loaded by
 * the CLI (`mcp-vertex --plugins=...`) that implement `IMcpPlugin`.
 */

// --- server assembly -------------------------------------------------------
export {
	createMcpProject,
	planRegistrationOrder,
} from '../lib/project/create-mcp-project';
export type { IMcpVertexProject } from '../lib/project/create-mcp-project';
export {
	gracefulShutdown,
	__resetShutdownGuardForTests,
} from '../lib/cli/graceful-shutdown';
export type { IGracefulShutdownOptions } from '../lib/cli/graceful-shutdown';

// --- workspace + paths -----------------------------------------------------
export { createWorkspacePathProvider } from '../lib/workspace/create-workspace-path-provider';
export type { IWorkspacePathProvider } from '../lib/contracts/interfaces/workspace-paths.interface';
export { DEFAULT_CORE_PATHS } from '../lib/contracts/interfaces/core-paths.interface';
export type { ICorePaths } from '../lib/contracts/interfaces/core-paths.interface';

// --- contracts -------------------------------------------------------------
export type {
	IHostContent,
	IHostIdentity,
	IHostObservability,
	IHostPaths,
	IHostRegistrations,
	IMcpVertexHostConfig,
} from '../lib/contracts/interfaces/host-config.interface';
export type { IMcpVertexProjectMetadata } from '../lib/contracts/interfaces/project-metadata.interface';
export type {
	IHostCapabilities,
	IHostCapabilityProfile,
	THostContinuationCapability,
	THostInstructionCapability,
	THostLifecycleCapability,
	THostSkillCapability,
} from '../lib/contracts/interfaces/host-capabilities.interface';
export { buildHostCapabilityPlan } from '../lib/hosts/host-capability-profile';
export type {
	IHostCapabilityAction,
	IHostCapabilityPlan,
} from '../lib/hosts/host-capability-profile';
export { buildHostAdapterPack } from '../lib/hosts/host-adapter-pack';
export type {
	IHostAdapterPack,
	IHostAdapterPackAction,
} from '../lib/hosts/host-adapter-pack';
export type { IStatusCollector } from '../lib/contracts/interfaces/status-collector.interface';
export type {
	IPromptRegistration,
	IResourceRegistration,
	IToolRegistration,
	// f00065 slice F: canonical tool-effect union, shared with @mcp-vertex/client.
	IToolEffect,
	// f00057 S11: deprecation marker for tools that have a documented
	// replacement (e.g. docs_search → search_search). Plugins attach it
	// to the registration and the handler returns a typed envelope.
	IToolDeprecationMarker,
} from '../lib/contracts/interfaces/tool-registration.interface';
export type {
	IValidationCommand,
	IValidationMatrix,
} from '../lib/contracts/interfaces/validation-matrix.interface';
export type {
	IQualityGate,
	IQualityGateExpect,
	IQualityGateLanguage,
	IQualityGateList,
} from '../lib/contracts/interfaces/quality-gate.interface';
export type { IPluginConfigExample } from '../lib/contracts/interfaces/plugin-config-example.interface';
export type {
	IKnowledgeEntry,
	ISkillEntry,
} from '../lib/contracts/interfaces/knowledge.interface';
// File-convention profile (f00037 / f00057 S8) — the canonical
// TypeScript rule chain used by both the lint engine and the
// `@mcp-vertex/conventions` plugin.
export {
	classifyPath,
	DEFAULT_TS_RULES,
	endsWithBasename,
	hasSegment,
} from '../lib/contracts/file-conventions.contract';
export type {
	IRoleRule,
	Role,
} from '../lib/contracts/file-conventions.contract';

// --- plugin system ---------------------------------------------------------
export { definePlugin } from '../lib/plugins/plugin-contract';
export type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from '../lib/plugins/plugin-contract';
export type { IResolvedHostIdentity } from '../lib/contracts/interfaces/resolved-host-identity.interface';
export {
	loadPlugins,
	nodeDynamicImport,
	resolvePluginSpecifier,
} from '../lib/plugins/load-plugins';
export type {
	ILoadedPlugin,
	IPluginLoadResult,
} from '../lib/plugins/load-plugins';
export {
	classifyOrigin,
	isFirstPartySpecifier,
} from '../lib/plugins/classify-origin';
export { FIRST_PARTY_SCOPE } from '../lib/contracts/constants/first-party-scope.constant';
export type {
	IPluginOriginInput,
	PluginOrigin,
} from '../lib/contracts/interfaces/plugin-origin.interface';
export {
	buildConfigurationCenterSnapshot,
	readConfigurationCenterSection,
	serializeConfigurationSchema,
} from '../lib/configuration-center/configuration-center';
export type {
	ConfigurationArtifactKind,
	ConfigurationCenterSection,
	ConfigurationOwnerOrigin,
	IConfigurationArtifact,
	IConfigurationCenterInput,
	IConfigurationCenterPage,
	IConfigurationCenterResult,
	IConfigurationCenterSnapshot,
	IConfigurationCenterSummary,
	IConfigurationOwner,
	IConfigurationPlugin,
	IConfigurationPluginCapabilities,
} from '../lib/contracts/interfaces/configuration-center.interface';
export { buildActivationReport } from '../lib/plugins/activation-report';
export type {
	ActivationSource,
	IActivationEntry,
	IActivationReport,
	IActivationSources,
	ILoadedPluginFacts,
} from '../lib/contracts/interfaces/activation-report.interface';
export {
	parseCliArgs,
	DEFAULT_CLI_ARGS,
	hasExplicitPluginSurfaceSelection,
} from '../lib/plugins/parse-cli-args';
export type { IMcpVertexCliArgs } from '../lib/plugins/parse-cli-args';
export {
	PLUGIN_DEFAULTS,
	resolvePluginOptions,
} from '../lib/plugins/plugin-defaults';
export {
	DEFAULT_SEARCH_HYBRID_WEIGHTS,
	PACK_DEFAULTS,
	resolveSearchHybridWeights,
	STACK_SEARCH_HYBRID_WEIGHTS,
} from '../lib/plugins/pack-defaults';
export type {
	IPackStackId,
	ISearchHybridWeights,
} from '../lib/plugins/pack-defaults';
export {
	describeStackPacks,
	isPackId,
	mergePackDefaults,
	PACK_DEFAULTS_OVERLAY,
	PACK_IDS,
	resolvePackOptions,
} from '../lib/plugins/pack-defaults-overlay';
export type {
	IPluginOptionsMap,
	IStackPackMeta,
	IPackId,
} from '../lib/plugins/pack-defaults-overlay';
export { deriveSourceRoots } from '../lib/bootstrap/derive-config';
export { mergeDerivedConfig } from '../lib/bootstrap/merge-derived-config';
export {
	PRESET_CATALOG,
	PRESET_KIND,
	resolvePresetMembers,
	isPresetKind,
} from '../lib/plugins/preset-catalog';
export type {
	IPresetDefinition,
	IPresetKind,
	IPresetMember,
} from '../lib/plugins/preset-catalog';
export {
	DEFAULT_CONFIG_FILENAME,
	CONFIG_FILE_SCHEMA,
	diagnoseConfigFile,
	diagnosePluginPathConfig,
	parseConfigFile,
	pluginConfigFor,
	resolveConfigPluginSpecifiers,
} from '../lib/plugins/load-config-file';
export { diagnoseWorkspaceLayout } from '../lib/plugins/diagnose-workspace-layout';
export type {
	IWorkspaceLayoutArgs,
	WorkspaceLayoutProbe,
	WorkspacePathStatus,
} from '../lib/contracts/interfaces/workspace-layout.interface';
export { assembleCliConfig } from '../lib/cli/assemble';
// f00120 S2: monorepo-wiring writer for first-party plugins.
export {
	wirePluginIntoMonorepo,
	writeTsconfigBase,
	writeVitestShared,
	writePluginDefaults,
	writePublishOrder,
	writePresetCatalog,
	writeCatalogRegen,
	buildTsconfigPathsEntry,
	pluginDir,
} from '../lib/scaffold/wire-plugin';
// f00120 S4: wiring-doctor (verifier) for first-party plugins.
export { diagnosePluginWiring } from '../lib/scaffold/diagnose-plugin-wiring';
export type {
	IPluginWiringEdit,
	IPluginWiringFs,
	IPluginWiringPoint,
	IPluginWiringReport,
	IPluginWiringWrite,
	IWirePluginOptions,
	PluginWiringPointId,
} from '../lib/contracts/interfaces/plugin-wiring.interface';
export type {
	IAssembledCliConfig,
	IAssembleCliDeps,
} from '../lib/cli/assemble';
export { runCli, runDoctor } from '../lib/cli/run-cli';
export type { IDoctorReport } from '../lib/cli/run-cli';
export type {
	IBootstrapPatternOverride,
	IBootstrapPatternOverrides,
	IFilesystemConfig,
	ILoopDetectorConfig,
	IMcpVertexCachePolicyConfig,
	IMcpVertexCacheWorktreesConfig,
	IMcpVertexConfigFile,
	IMcpVertexCorePathsConfig,
	IMcpVertexPluginConfig,
	IValidationMatrixConfig,
	IValidationMatrixScope,
} from '../lib/plugins/load-config-file';

// --- scaffolding kit ("tools to create tools/plugins") ---------------------
export {
	scaffoldAgentFile,
	scaffoldClaudeAgentFile,
	scaffoldClientFiles,
	scaffoldHostConfigFile,
	scaffoldHostProject,
	scaffoldInstructionsFile,
	scaffoldPluginFiles,
	scaffoldPromptFile,
	scaffoldServerEntryFiles,
	scaffoldSkillFile,
	scaffoldToolFile,
} from '../lib/scaffold/scaffold-host';
export { extractPlugin } from '../lib/scaffold/extract-plugin';
export type {
	IScaffoldAgentSlot,
	IScaffoldClientOptions,
	IScaffoldHostOptions,
	IScaffoldPluginOptions,
	IScaffoldedFile,
} from '../lib/scaffold/scaffold-host';
export type {
	BlueprintFile,
	IPluginBlueprintDeps,
} from '../lib/scaffold/plugin-blueprint';
export { renderPluginBlueprint } from '../lib/scaffold/plugin-blueprint';
export type {
	IExtractedTool,
	IExtractPluginOptions,
	IExtractPluginResult,
} from '../lib/scaffold/extract-plugin';
export { scaffoldExtensionHostFiles } from '../lib/scaffold/scaffold-extension-host';
export type { IScaffoldExtensionHostOptions } from '../lib/contracts/interfaces/scaffold-extension-host-options.interface';
export {
	SCAFFOLD_INPUT_SCHEMA,
	buildScaffoldReport,
	buildScaffoldToolRegistration,
} from '../lib/scaffold/scaffold-tool';
export type {
	IScaffoldArgs,
	IScaffoldReport,
	IScaffoldToolOptions,
} from '../lib/scaffold/scaffold-tool';
export {
	CREATE_PLUGIN_INPUT_SCHEMA,
	CREATE_PLUGIN_OUTPUT_SCHEMA,
	buildCreatePluginToolRegistration,
	runCreatePlugin,
} from '../lib/scaffold/create-plugin.tool';
export type {
	ICreatePluginArgs,
	ICreatePluginOutput,
	ICreatePluginToolOptions,
	IRegenerateCatalogArgs,
} from '../lib/scaffold/create-plugin.tool';

// --- shared filesystem helpers ---------------------------------------------
export {
	writeFileAtomic,
	writeFileAtomicSync,
} from '../lib/shared/atomic-write';
export { joinRel } from '../lib/shared/paths';
export {
	resolveAgainstRoots,
	resolveWorkspaceContained,
} from '../lib/shared/contain-path';
export type { IContainedPath } from '../lib/shared/contain-path';
// f00087 S2: batch atomic writer for consumers that want to apply
// scaffolded files outside an MCP session.
export { createFileSystemBatchWriter } from '../lib/shared/batch-atomic-writer';
export type {
	IBatchAtomicWriter,
	IBatchOperation,
	IBatchOperationError,
	IBatchWriteResult,
} from '../lib/shared/batch-atomic-writer';

// --- ephemeral exec paths (f00080) -----------------------------------------
// Canonical home for artefacts a plugin or agent creates, runs (or
// parses), and then deletes. Resolves through `IMcpPluginContext` so the
// path is derived, never hardcoded. See `docs/mcp-vertex/proposals/
// done/f00080-canonical-ephemeral-exec-paths-in-plugin-cache.md`.
export {
	EXEC_SUBDIR_NAME,
	execDirRelative,
	pruneExpiredExec,
	resolveExecPath,
	withEphemeralExec,
} from '../lib/shared/exec-path';
export type {
	IResolvedExecPath,
	IPruneExpiredResult,
	IResolveExecPathOptions,
} from '../lib/shared/exec-path';

// --- cache eviction (f00068 slice A) ---------------------------------------
// Declarative policy layer over the shared `<cacheDir>` root. Plugins
// contribute rules via `ctx.cacheEvictionRegistry.register(rule)`; the
// core boot sweep runs a dry-run after every plugin has loaded.
export type {
	ICacheEvictionCustom,
	ICacheEvictionErrored,
	ICacheEvictionKeepLastN,
	ICacheEvictionOlderThan,
	ICacheEvictionOlderThanMtime,
	ICacheEvictionRegistry,
	ICacheEvictionRemoved,
	ICacheEvictionReport,
	ICacheEvictionRule,
	ICacheEvictionRunOptions,
	ICacheEvictionSkipped,
	ICacheEvictionWhen,
} from '../lib/contracts/interfaces/cache-eviction.interface';
export { createCacheEvictionRegistry } from '../lib/cache/eviction-registry';

// --- peer plugins (loaded-set introspection) ------------------------------
// Plugins that need to gate runtime behaviour on whether another plugin
// is loaded (e.g. an audit plugin deciding whether to scaffold
// proposals via the `proposals` plugin) consult
// `ctx.peerPlugins.list()` / `.has(name)`. The registry is populated
// by the core AFTER `loadPlugins()` returns; at register time it is
// empty.
export type { IPeerPluginRegistry } from '../lib/plugins/plugin-contract';
export { createPeerPluginRegistry } from '../lib/plugins/peer-plugin-registry';
export type { IEvictionRegistryDeps } from '../lib/cache/eviction-registry';
export { walkAllowedFiles } from '../lib/shared/walk-allowed-files';
export type { IWalkAllowedFilesOptions } from '../lib/shared/walk-allowed-files';
export { redactSecrets } from '../lib/shared/redact';
export type { IRedactResult } from '../lib/shared/redact';
export { killProcessGroup } from '../lib/commands/process-group';
export { runArgv, runCommand } from '../lib/shared/run-command';
export type {
	IRunCommandOptions,
	IRunCommandOutcome,
} from '../lib/shared/run-command';
export type {
	IRunArgvOptions,
	IRunArgvOutcome,
} from '../lib/contracts/interfaces/run-command.interface';
export {
	fsRead,
	fsWrite,
	buildFsToolRegistrations,
} from '../lib/shared/fs-tools';
export type {
	IFsReadResult,
	IFsWriteOptions,
	IFsWriteResult,
	IFsToolOptions,
} from '../lib/shared/fs-tools';

// --- IDE install helper (`mcp-vertex init`) ---------------------------------
export { mergeServerEntry } from '../lib/install/merge-config';
export type {
	IMcpConfigKind,
	IMergeAction,
	IMergeResult,
} from '../lib/install/merge-config';
export { IDE_TARGETS, targetById } from '../lib/install/ide-targets';
export type {
	IIdeInstallTarget,
	IInstallEnv,
} from '../lib/install/ide-targets';
export {
	buildServerEntry,
	detectOs,
	detectTargets,
	installToTarget,
	runInstall,
} from '../lib/install/installer';
export type {
	IInstallOptions,
	IInstallReport,
	IInstallTargetResult,
	IOsId,
	IOsInfo,
	IRunnerVia,
} from '../lib/install/installer';

export {
	withFileMutex,
	LockContentionError,
} from '../lib/shared/with-file-mutex';
export type { IFileMutexOptions } from '../lib/shared/with-file-mutex';

// --- write-side git primitives (S9: git_commit/git_push, auto_work persist) ---
export {
	createGitRunner as createWriteGitRunner,
	gitAdd,
	gitCommit,
	gitPush,
	gitHeadShortHash,
	gitLastCommitAuthor,
	commitAndPush,
} from '../lib/shared/git-write';
export type {
	IGitRunner as IWriteGitRunner,
	IGitRunResult as IWriteGitRunResult,
	ICommitOptions,
	IPushOptions,
	IPushForceMode,
	ICommitAndPushOptions,
	ICommitAndPushResult,
} from '../lib/shared/git-write';
// --- commit author policy (f00082) ---
export {
	resolveCommitAuthor,
	COMMIT_AUTHOR_MODES,
	createGitConfigReader,
} from '../lib/shared/commit-author';
export type {
	CommitAuthorMode,
	ICommitAuthorIdentity,
	ICommitAuthorNamed,
	ICommitAuthorInput,
	ICommitAuthorResolution,
	IGitConfigReader,
} from '../lib/shared/commit-author';

// f00065 slice F: the canonical shared git-runner contract. Plugins that used
// to redefine this type (git, proposals) import it from here instead.
export type {
	IGitRunner,
	IGitRunResult,
} from '../lib/contracts/interfaces/git-runner.interface';
// f00082: composite agent identity contract. Plugins that produce or
// consume the four-field identity (proposals worktree engine, handoff
// packets, swarm tools) import from here so the contract has one
// source of truth.
export type {
	AgentHost,
	IAgentIdentity,
} from '../lib/contracts/interfaces/agent-identity.interface';
export { AGENT_IDENTITY_LIMITS } from '../lib/contracts/interfaces/agent-identity.interface';
// f00067 S1: the canonical multi-model provider contract. Wiki pages
// 04/05/06/07/08 and both consuming plugins (orchestrator-runner,
// usage-tracking) import the provider vocabulary from this single file so
// there is no drift between the design text and the code.
export type {
	CapabilityTag,
	CostTier,
	IProviderAvailability,
	IProviderCapabilities,
	IProviderInvoke,
	IProviderSummary,
	IRoutingDecision,
	IRoutingScoreEntry,
	ProviderKind,
	ProviderState,
	RoutingMode,
	RoutingStrategy,
} from '../lib/contracts/interfaces/provider-capabilities.interface';
export { CAPABILITY_TAGS } from '../lib/contracts/interfaces/provider-capabilities.interface';
export {
	CorruptFileError,
	quarantineCorruptFile,
	quarantineCorruptFileSync,
} from '../lib/shared/quarantine-corrupt-file';

// --- shared tool-response helpers (compact JSON + error envelope) ----------
export {
	toolJson,
	toolOk,
	toolError,
	toolErrorWithLogHint,
	truncateIfTooLarge,
	toolJsonBounded,
	DEFAULT_MAX_RESPONSE_BYTES,
} from '../lib/shared/tool-response';
export type {
	IToolTextResult,
	IToolErrorLogHint,
	ITruncationResult,
} from '../lib/shared/tool-response';

// --- core meta-tools (overview / knowledge / validation matrix) ------------
export { buildOverviewToolRegistration } from '../lib/tools/overview-tool';
export type {
	IOverviewSnapshot,
	IOverviewToolEntry,
	IOverviewPlugin,
} from '../lib/tools/overview-tool';
export type {
	CatalogSection,
	ICatalogSnapshot,
	ICatalogSources,
	IProposalSummary,
	ISkillSummary,
	IToolSummary,
	ProposalStatus,
} from '../lib/catalog/agent-discovery-types';
export { buildCatalog } from '../lib/catalog/agent-discovery-catalog';
export type { IBuildCatalogOptions } from '../lib/catalog/agent-discovery-types';
export {
	ACTIONABLE_PROPOSAL_STATUSES,
	PROPOSAL_STATUS_VALUES,
} from '../lib/catalog/agent-discovery-types';
export { buildKnowledgeToolRegistration } from '../lib/tools/knowledge-tool';
export { buildAgentCatalogToolRegistration } from '../lib/tools/agent-catalog-tool';
export { buildValidationMatrixToolRegistration } from '../lib/tools/validation-matrix-tool';
export {
	buildStatusToolRegistration,
	collectStatus,
} from '../lib/tools/status-tool';
export type { IStatusResult } from '../lib/tools/status-tool';
export {
	createMetricsRegistry,
	estimateResultBytes,
} from '../lib/metrics/metrics-registry';
export type {
	IMetricsRegistry,
	IMetricsSnapshot,
	IMetricRecord,
	IToolMetric,
} from '../lib/metrics/metrics-registry';
export { buildMetricsToolRegistration } from '../lib/metrics/metrics-tool';
export {
	runMigrations,
	MigrationError,
} from '../lib/migrations/migrate';
export type {
	IVersioned,
	IMigrator,
	IMigrationResult,
} from '../lib/migrations/migrate';
export { migrateJsonFile } from '../lib/migrations/migrate-file';
export type {
	IMigrateFileOptions,
	IMigrateFileResult,
} from '../lib/migrations/migrate-file';
export { buildKnowledgeResourceRegistrations } from '../lib/tools/knowledge-resources';
export { buildStartPromptRegistration } from '../lib/tools/start-prompt';
export { buildAgentCatalogResourceRegistration } from '../lib/resources/agent-catalog-resource';
export { buildAgentBootstrapPromptRegistration } from '../lib/prompts/agent-bootstrap.prompt';

// --- hybrid project analyzer (bootstrap) -----------------------------------
export {
	analyzeProject,
	recommendServerPlan,
	PROJECT_PATTERN_CATALOG,
	buildBootstrapToolRegistrations,
	createWorkspaceFileReader,
	buildServerBlueprint,
	buildBlueprintFiles,
} from '../lib/bootstrap/index';
export type {
	IProjectAnalysis,
	IServerPlan,
	IProjectPattern,
	IFileReader,
	IBootstrapToolOptions,
	IServerBlueprint,
	IBlueprintArtifact,
	IBlueprintOptions,
} from '../lib/bootstrap/index';

// --- versioned skill bundles (f00029 S4; f00065 S1: skills owned by package/plugin) ------
export { loadSkills } from '../lib/skills/load-skills';
export type { ISkillBundle } from '../lib/skills/load-skills';
export {
	CORE_SKILLS_ROOT,
	SKILL_MANIFEST_REL,
	pluginSkillsRoot,
	ownerRootForAppliesTo,
	skillBodyPath,
	skillOwnerRoots,
} from '../lib/skills/skill-paths';
export {
	buildSkillCatalog,
	extractSkillDescription,
} from '../lib/skills/skill-catalog';
export type {
	ISkillCatalog,
	ISkillCatalogEntry,
} from '../lib/skills/skill-catalog';

// --- cross-project setup engine (f00030 S2) -------------------------------
export { buildGithubSetupSteps } from '../lib/setup/setup-steps';
export type {
	GithubAuthTier,
	IGithubSetupContext,
	ISetupStep,
} from '../lib/setup/setup-steps';
export { renderCrossProjectGuide } from '../lib/setup/cross-project-guide';

// --- agent shell-fallback ladder (f00085) ---------------------------------
// Self-healing recovery for the run_in_terminal wrapper's stuck-state
// ("búfer alternativo") failure mode. Plugins and swarm agents import
// `withShellFallback` and the Ring-3 intent adapter from here.
export {
	detectStuckShell,
	mapShellIntentToTool,
	SHELL_INTENT_MAP,
	STUCK_SHELL_SENTINELS,
	withShellFallback,
} from '../lib/agents/shell-fallback';
export type {
	IShellFallbackDriver,
	IShellFallbackOutcome,
	IShellIntent,
	IShellResult,
	IShellToolPlan,
	ShellFallbackRing,
} from '../lib/agents/shell-fallback';

// --- shared external-tool / scanner core (r00012) --------------------------
// One runner + one probe + one finding shape that security, deps-audit,
// perf, forge, browser and database all compose, so a scanner is a thin
// adapter (raw tool output → IFinding[]) instead of re-implementing
// subprocess + parse + presence + install-hint each time.
export {
	probeTool,
	probeTools,
	realProbeDeps,
} from '../lib/external-tool/probe';
export {
	makeRedactor,
	runExternalTool,
} from '../lib/external-tool/run-external-tool';
export {
	renderFindingSummary,
	renderFindingsTable,
	sortFindings,
	summarizeFindings,
	toScanResult,
	worstSeverity,
} from '../lib/external-tool/render-findings';
export { aggregateScans } from '../lib/external-tool/aggregate-scans';
export { FINDING_SEVERITY_ORDER } from '../lib/contracts/constants/finding.constant';
export type {
	IArgvExec,
	IExternalTool,
	IExternalToolRun,
	IInstallHint,
	IProbeDeps,
	IRunExternalToolInput,
	IToolProbeResult,
} from '../lib/contracts/interfaces/external-tool.interface';
export type {
	FindingSeverity,
	IAggregatedScan,
	IFinding,
	IFindingCounts,
	IFindingLocation,
	IScanResult,
	IScanSkip,
} from '../lib/contracts/interfaces/finding.interface';

// --- plugin registry (f00141 S1) ---
export type {
	IPluginRegistryEntry,
	PluginRegistryOrigin,
	IPluginRegistrySource,
	IResolvePluginsOptions,
	IResolvePluginsResult,
} from '../lib/contracts/interfaces/plugin-registry.interface';
export { FIRST_PARTY_PLUGIN_INDEX } from '../lib/registry/first-party-index';
export { resolvePlugins } from '../lib/registry/resolve';
export {
	buildPluginAddRecipe,
	type IPluginAddRecipe,
	type IPluginAddStep,
	type PluginAddKind,
} from '../lib/registry/plugin-add';
export {
	buildPluginAddRegistration,
	type IPluginAddToolOptions,
} from '../lib/registry/plugin-add.tool';
export {
	buildPluginSearchRegistration,
	type IPluginSearchToolOptions,
} from '../lib/registry/plugin-search.tool';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';

// --- f00152 S5 (L3): feature flags ---
export {
	coreFeatureFlag,
	readFeatureFlag,
} from '../lib/plugins/feature-flags';
export type {
	IFeatureFlagEntry,
	IFeatureFlagSource,
} from '../lib/plugins/feature-flags';

// --- f00152 S2 (L4): stable API facade ---
export {
	STABLE_API_TOOLS,
	STABLE_API_TOOL_NAMES,
	describeStableTool,
	findStableDescriptor,
} from '../lib/api/stable-facade';
export type {
	IStableToolDescriptor,
	TStableSemverGuarantee,
} from '../lib/api/stable-facade';
export {
	SCHEMA_VERSION,
	STABLE_MANIFEST_REL,
	buildStableManifest,
} from '../lib/api/stable-manifest';
export type {
	IStableManifest,
	IStableManifestTool,
	IStableManifestVersion,
} from '../lib/api/stable-manifest';

// --- f00154 S1: incident-driven types (formerly internal to plugin-contract) ---
// Third-party plugin authors need these to type their `ctx.logs.log(...)`
// calls without importing from `@mcp-vertex/core/lib/...` (the internal
// surface). The re-export pins the public contract.
//
// The `severity` and `incidentType` unions live inline on
// `IPluginLogInput` (the canonical shape); re-export the helper so a
// third-party plugin can `import type { IPluginLogsHelper, IPluginLogInput }`
// and then `ctx.logs?.log({ severity: 'critical', incidentType: 'x', ... })`
// against the same syslog taxonomy f00153 ships.
export type {
	IPluginLogsHelper,
	IPluginLogInput,
	ILogsSink,
	ISinkEvent,
} from '../lib/plugins/plugin-contract';
// --- f00154 S3: incident-driven adapter ---
// `withIncidentLogging` is the wrapper plugins apply to a tool
// handler so the handler's `toolError(...)` paths become structured
// incidents on the `logs` JSONL streams (or the `ConsoleLogsSink`
// when the `logs` plugin is not loaded). `emitIncident` is the
// one-line helper for plugins that build the error envelope
// themselves.
export {
	withIncidentLogging,
	emitIncident,
} from '../lib/tools/with-incident-logging';
export type {
	IWithIncidentLoggingOptions,
	IIncidentLoggingContext,
} from '../lib/tools/with-incident-logging';
// c00126 S2: scan helpers - pure utilities adopted by the SOLID-compliance
// lint and any future lint. See `packages/core/src/lib/scan/` for the
// full module set; this block re-exports the public surface.
export {
	buildRegistrySkeleton,
	detectCatchSwallow,
	detectDipViolations,
	detectLongChains,
	detectMagicNumbers,
	formatFixProposal,
	fnv1a,
	lineOf,
	MAGIC_WHITELIST,
	shingleBlocks,
	toRelPosix,
	walkTsFiles,
} from '../lib/scan';
export type {
	ChainKind,
	DipKind,
	ICatchSwallowHit,
	IDipHit,
	IFixProposal,
	ILongChainHit,
	ILongChainsOptions,
	IMagicNumberHit,
	IShingleHit,
	IShingleOptions,
} from '../lib/scan';
