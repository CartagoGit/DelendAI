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
	__resetShutdownGuardForTests,
	gracefulShutdown,
} from '../lib/cli/graceful-shutdown';
export type { IGracefulShutdownOptions } from '../lib/cli/graceful-shutdown';
export {
	createMcpProject,
	planRegistrationOrder,
} from '../lib/project/create-mcp-project';
export type { IMcpVertexProject } from '../lib/project/create-mcp-project';

// --- workspace + paths -----------------------------------------------------
export { DEFAULT_CORE_PATHS } from '../lib/contracts/interfaces/core-paths.interface';
export type { ICorePaths } from '../lib/contracts/interfaces/core-paths.interface';
export type { IWorkspacePathProvider } from '../lib/contracts/interfaces/workspace-paths.interface';
export { createWorkspacePathProvider } from '../lib/workspace/create-workspace-path-provider';

// --- contracts -------------------------------------------------------------
export type {
	IHostCapabilities,
	IHostCapabilityProfile,
	THostContinuationCapability,
	THostInstructionCapability,
	THostLifecycleCapability,
	THostSkillCapability,
} from '../lib/contracts/interfaces/host-capabilities.interface';
export type {
	IHostContent,
	IHostIdentity,
	IHostObservability,
	IHostPaths,
	IHostRegistrations,
	IMcpVertexHostConfig,
} from '../lib/contracts/interfaces/host-config.interface';
export type {
	IKnowledgeEntry,
	ISkillEntry,
} from '../lib/contracts/interfaces/knowledge.interface';
export type { IPluginConfigExample } from '../lib/contracts/interfaces/plugin-config-example.interface';
export type { IMcpVertexProjectMetadata } from '../lib/contracts/interfaces/project-metadata.interface';
export type {
	IQualityGate,
	IQualityGateExpect,
	IQualityGateLanguage,
	IQualityGateList,
} from '../lib/contracts/interfaces/quality-gate.interface';
export type { IStatusCollector } from '../lib/contracts/interfaces/status-collector.interface';
export type {
	IPromptRegistration,
	IResourceRegistration,
	// f00057 S11: deprecation marker for tools that have a documented
	// replacement (e.g. docs_search → search_search). Plugins attach it
	// to the registration and the handler returns a typed envelope.
	IToolDeprecationMarker,
	// f00065 slice F: canonical tool-effect union, shared with @mcp-vertex/client.
	IToolEffect,
	IToolRegistration,
} from '../lib/contracts/interfaces/tool-registration.interface';
export type {
	IValidationCommand,
	IValidationMatrix,
} from '../lib/contracts/interfaces/validation-matrix.interface';
export { buildHostAdapterPack } from '../lib/hosts/host-adapter-pack';
export type {
	IHostAdapterPack,
	IHostAdapterPackAction,
} from '../lib/hosts/host-adapter-pack';
export { buildHostCapabilityPlan } from '../lib/hosts/host-capability-profile';
export type {
	IHostCapabilityAction,
	IHostCapabilityPlan,
} from '../lib/hosts/host-capability-profile';
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
export { deriveSourceRoots } from '../lib/bootstrap/derive-config';
export { mergeDerivedConfig } from '../lib/bootstrap/merge-derived-config';
export { assembleCliConfig } from '../lib/cli/assemble';
export {
	buildConfigurationCenterSnapshot,
	readConfigurationCenterSection,
	serializeConfigurationSchema,
} from '../lib/configuration-center/configuration-center';
export { FIRST_PARTY_SCOPE } from '../lib/contracts/constants/first-party-scope.constant';
export type {
	ActivationSource,
	IActivationEntry,
	IActivationReport,
	IActivationSources,
	ILoadedPluginFacts,
} from '../lib/contracts/interfaces/activation-report.interface';
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
export type {
	IPluginOriginInput,
	PluginOrigin,
} from '../lib/contracts/interfaces/plugin-origin.interface';
export type { IResolvedHostIdentity } from '../lib/contracts/interfaces/resolved-host-identity.interface';
export type {
	IWorkspaceLayoutArgs,
	WorkspaceLayoutProbe,
	WorkspacePathStatus,
} from '../lib/contracts/interfaces/workspace-layout.interface';
export { buildActivationReport } from '../lib/plugins/activation-report';
export {
	classifyOrigin,
	isFirstPartySpecifier,
} from '../lib/plugins/classify-origin';
export { diagnoseWorkspaceLayout } from '../lib/plugins/diagnose-workspace-layout';
export {
	CONFIG_FILE_SCHEMA,
	DEFAULT_CONFIG_FILENAME,
	diagnoseConfigFile,
	diagnosePluginPathConfig,
	parseConfigFile,
	pluginConfigFor,
	resolveConfigPluginSpecifiers,
} from '../lib/plugins/load-config-file';
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
	IPackId,
	IPluginOptionsMap,
	IStackPackMeta,
} from '../lib/plugins/pack-defaults-overlay';
export {
	DEFAULT_CLI_ARGS,
	hasExplicitPluginSurfaceSelection,
	parseCliArgs,
} from '../lib/plugins/parse-cli-args';
export type { IMcpVertexCliArgs } from '../lib/plugins/parse-cli-args';
export { definePlugin } from '../lib/plugins/plugin-contract';
export type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from '../lib/plugins/plugin-contract';
export {
	injectCheckpointAdvisory,
	mergeCheckpointAdvisories,
	selectCheckpointAdvisory,
} from '../lib/shared/checkpoint-advisory';
export type {
	BeforeToolCallHook,
	CheckpointAdvisoryProvider,
	CheckpointAdvisorySeverity,
	ICheckpointAdvisory,
	ICheckpointAdvisoryContext,
} from '../lib/contracts/interfaces/checkpoint-advisory.interface';
export { CHECKPOINT_ADVISORY_SEVERITIES } from '../lib/contracts/interfaces/checkpoint-advisory.interface';
export {
	PLUGIN_DEFAULTS,
	resolvePluginOptions,
} from '../lib/plugins/plugin-defaults';
export {
	isPresetKind,
	PRESET_CATALOG,
	PRESET_KIND,
	resolvePresetMembers,
} from '../lib/plugins/preset-catalog';
export type {
	IPresetDefinition,
	IPresetKind,
	IPresetMember,
} from '../lib/plugins/preset-catalog';
// f00120 S2: monorepo-wiring writer for first-party plugins.
export {
	buildTsconfigPathsEntry,
	pluginDir,
	wirePluginIntoMonorepo,
	writeCatalogRegen,
	writePluginDefaults,
	writePresetCatalog,
	writePublishOrder,
	writeTsconfigBase,
	writeVitestShared,
} from '../lib/scaffold/wire-plugin';
// f00120 S4: wiring-doctor (verifier) for first-party plugins.
export type {
	IAssembleCliDeps,
	IAssembledCliConfig,
} from '../lib/cli/assemble';
export { runCli, runDoctor } from '../lib/cli/run-cli';
export type { IDoctorReport } from '../lib/cli/run-cli';
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
export { diagnosePluginWiring } from '../lib/scaffold/diagnose-plugin-wiring';

// --- scaffolding kit ("tools to create tools/plugins") ---------------------
export type { IScaffoldExtensionHostOptions } from '../lib/contracts/interfaces/scaffold-extension-host-options.interface';
export {
	buildCreatePluginToolRegistration,
	CREATE_PLUGIN_INPUT_SCHEMA,
	CREATE_PLUGIN_OUTPUT_SCHEMA,
	runCreatePlugin,
} from '../lib/scaffold/create-plugin.tool';
export type {
	ICreatePluginArgs,
	ICreatePluginOutput,
	ICreatePluginToolOptions,
	IRegenerateCatalogArgs,
} from '../lib/scaffold/create-plugin.tool';
export { extractPlugin } from '../lib/scaffold/extract-plugin';
export type {
	IExtractedTool,
	IExtractPluginOptions,
	IExtractPluginResult,
} from '../lib/scaffold/extract-plugin';
export { renderPluginBlueprint } from '../lib/scaffold/plugin-blueprint';
export type {
	BlueprintFile,
	IPluginBlueprintDeps,
} from '../lib/scaffold/plugin-blueprint';
export { scaffoldExtensionHostFiles } from '../lib/scaffold/scaffold-extension-host';
export {
	detectExistingMcpVertexInstall,
	findMcpVertexServerName,
	isMcpVertexLaunchShape,
	resolveHostScaffoldDefaults,
} from '../lib/scaffold/detect-existing-install';
export type { IExistingMcpVertexInstall } from '../lib/scaffold/detect-existing-install';
export {
	scaffoldAgentFile,
	scaffoldClaudeAgentFile,
	scaffoldClientFiles,
	scaffoldCodexAgentFile,
	scaffoldHostConfigFile,
	scaffoldHostProject,
	scaffoldInstructionsFile,
	scaffoldPluginFiles,
	scaffoldPromptFile,
	scaffoldServerEntryFiles,
	scaffoldSkillFile,
	scaffoldToolFile,
} from '../lib/scaffold/scaffold-host';
export type {
	IScaffoldAgentSlot,
	IScaffoldClientOptions,
	IScaffoldedFile,
	IScaffoldHostOptions,
	IScaffoldPluginOptions,
} from '../lib/scaffold/scaffold-host';
export {
	buildScaffoldReport,
	buildScaffoldToolRegistration,
	SCAFFOLD_INPUT_SCHEMA,
} from '../lib/scaffold/scaffold-tool';
export { buildStandaloneCoreToolRegistrations } from '../lib/scaffold/standalone-core-tools';
export type { IStandaloneCoreToolsOptions } from '../lib/scaffold/standalone-core-tools';
export type {
	IScaffoldArgs,
	IScaffoldReport,
	IScaffoldToolOptions,
} from '../lib/scaffold/scaffold-tool';

// --- shared filesystem helpers ---------------------------------------------
export {
	writeFileAtomic,
	writeFileAtomicSync,
} from '../lib/shared/atomic-write';
export {
	resolveAgainstRoots,
	resolveWorkspaceContained,
} from '../lib/shared/contain-path';
export type { IContainedPath } from '../lib/shared/contain-path';
export { joinUnderRoot } from '../lib/shared/join-under-root';
export { joinRel } from '../lib/shared/paths';
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
	IPruneExpiredResult,
	IResolvedExecPath,
	IResolveExecPathOptions,
} from '../lib/shared/exec-path';

// --- cache eviction (f00068 slice A) ---------------------------------------
// Declarative policy layer over the shared `<cacheDir>` root. Plugins
// contribute rules via `ctx.cacheEvictionRegistry.register(rule)`; the
// core boot sweep runs a dry-run after every plugin has loaded.
export { createCacheEvictionRegistry } from '../lib/cache/eviction-registry';
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

// --- peer plugins (loaded-set introspection) ------------------------------
// Plugins that need to gate runtime behaviour on whether another plugin
// is loaded (e.g. an audit plugin deciding whether to scaffold
// proposals via the `proposals` plugin) consult
// `ctx.peerPlugins.list()` / `.has(name)`. The registry is populated
// by the core AFTER `loadPlugins()` returns; at register time it is
// empty.
export type { IEvictionRegistryDeps } from '../lib/cache/eviction-registry';
export { killProcessGroup } from '../lib/commands/process-group';
export type {
	IRunArgvOptions,
	IRunArgvOutcome,
} from '../lib/contracts/interfaces/run-command.interface';
export { createPeerPluginRegistry } from '../lib/plugins/peer-plugin-registry';
export type { IPeerPluginRegistry } from '../lib/plugins/plugin-contract';
export {
	buildFsToolRegistrations,
	fsRead,
	fsWrite,
} from '../lib/shared/fs-tools';
export type {
	IFsReadResult,
	IFsToolOptions,
	IFsWriteOptions,
	IFsWriteResult,
} from '../lib/shared/fs-tools';
export { redactSecrets } from '../lib/shared/redact';
export type { IRedactResult } from '../lib/shared/redact';
export {
	UNICODE_TOKEN_LEGEND,
	decodeUnicodeFromAgent,
	inspectUnicodeForAgent,
	rewriteUnicodeForAgent,
} from '../lib/shared/unicode-safe-text';
export type {
	IUnicodeSafeText,
	UnicodeTokenKind,
} from '../lib/contracts/interfaces/unicode-safe-text.interface';
export { runArgv, runCommand } from '../lib/shared/run-command';
export type {
	IRunCommandOptions,
	IRunCommandOutcome,
} from '../lib/shared/run-command';
export { walkAllowedFiles } from '../lib/shared/walk-allowed-files';
export type { IWalkAllowedFilesOptions } from '../lib/shared/walk-allowed-files';

// --- IDE install helper (`mcp-vertex init`) ---------------------------------
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
export { mergeServerEntry } from '../lib/install/merge-config';
export type {
	IMcpConfigKind,
	IMergeAction,
	IMergeResult,
} from '../lib/install/merge-config';

export {
	LockContentionError,
	withFileMutex,
} from '../lib/shared/with-file-mutex';
export type { IFileMutexOptions } from '../lib/shared/with-file-mutex';

// --- write-side git primitives (S9: git_commit/git_push, auto_work persist) ---
export {
	commitAndPush,
	createGitRunner as createWriteGitRunner,
	gitAdd,
	gitCommit,
	gitHeadShortHash,
	gitLastCommitAuthor,
	gitPush,
} from '../lib/shared/git-write';
export type {
	ICommitAndPushOptions,
	ICommitAndPushResult,
	ICommitOptions,
	IPushForceMode,
	IPushOptions,
	IGitRunner as IWriteGitRunner,
	IGitRunResult as IWriteGitRunResult,
} from '../lib/shared/git-write';
// --- commit author policy (f00082) ---
export {
	COMMIT_AUTHOR_MODES,
	createGitConfigReader,
	resolveCommitAuthor,
} from '../lib/shared/commit-author';
export type {
	CommitAuthorMode,
	ICommitAuthorIdentity,
	ICommitAuthorInput,
	ICommitAuthorNamed,
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
export { AGENT_IDENTITY_LIMITS } from '../lib/contracts/interfaces/agent-identity.interface';
export type {
	AgentHost,
	IAgentIdentity,
} from '../lib/contracts/interfaces/agent-identity.interface';
// f00067 S1: the canonical multi-model provider contract. Wiki pages
// 04/05/06/07/08 and both consuming plugins (orchestrator-runner,
// usage-tracking) import the provider vocabulary from this single file so
// there is no drift between the design text and the code.
export { CAPABILITY_TAGS } from '../lib/contracts/interfaces/provider-capabilities.interface';
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
export {
	CorruptFileError,
	quarantineCorruptFile,
	quarantineCorruptFileSync,
} from '../lib/shared/quarantine-corrupt-file';

// --- shared tool-response helpers (compact JSON + error envelope) ----------
export {
	DEFAULT_MAX_RESPONSE_BYTES,
	toolError,
	toolErrorWithLogHint,
	toolJson,
	toolJsonBounded,
	toolOk,
	truncateIfTooLarge,
} from '../lib/shared/tool-response';
export type {
	IToolErrorLogHint,
	IToolTextResult,
	ITruncationResult,
} from '../lib/shared/tool-response';

// --- core meta-tools (overview / knowledge / validation matrix) ------------
export { buildCatalog } from '../lib/catalog/agent-discovery-catalog';
export {
	ACTIONABLE_PROPOSAL_STATUSES,
	PROPOSAL_STATUS_VALUES,
} from '../lib/catalog/agent-discovery-types';
export type {
	CatalogSection,
	IBuildCatalogOptions,
	ICatalogSnapshot,
	ICatalogSources,
	IProposalSummary,
	ISkillSummary,
	IToolSummary,
	ProposalStatus,
} from '../lib/catalog/agent-discovery-types';
export {
	createMetricsRegistry,
	estimateResultBytes,
} from '../lib/metrics/metrics-registry';
export type {
	IMetricRecord,
	IMetricsRegistry,
	IMetricsSnapshot,
	IToolMetric,
} from '../lib/metrics/metrics-registry';
export { buildMetricsToolRegistration } from '../lib/metrics/metrics-tool';
export {
	MigrationError,
	runMigrations,
} from '../lib/migrations/migrate';
export type {
	IMigrationResult,
	IMigrator,
	IVersioned,
} from '../lib/migrations/migrate';
export { migrateJsonFile } from '../lib/migrations/migrate-file';
export type {
	IMigrateFileOptions,
	IMigrateFileResult,
} from '../lib/migrations/migrate-file';
export { buildAgentBootstrapPromptRegistration } from '../lib/prompts/agent-bootstrap.prompt';
export { buildAgentCatalogResourceRegistration } from '../lib/resources/agent-catalog-resource';
export { buildAgentCatalogToolRegistration } from '../lib/tools/agent-catalog-tool';
export { buildKnowledgeResourceRegistrations } from '../lib/tools/knowledge-resources';
export { buildKnowledgeToolRegistration } from '../lib/tools/knowledge-tool';
export { buildOverviewToolRegistration } from '../lib/tools/overview-tool';
export type {
	IOverviewPlugin,
	IOverviewSnapshot,
	IOverviewToolEntry,
} from '../lib/tools/overview-tool';
export { buildStartPromptRegistration } from '../lib/tools/start-prompt';
export {
	buildStatusToolRegistration,
	collectStatus,
} from '../lib/tools/status-tool';
export type { IStatusResult } from '../lib/tools/status-tool';
export { buildValidationMatrixToolRegistration } from '../lib/tools/validation-matrix-tool';

// --- hybrid project analyzer (bootstrap) -----------------------------------
export {
	analyzeProject,
	buildBlueprintFiles,
	buildBootstrapToolRegistrations,
	buildServerBlueprint,
	createWorkspaceFileReader,
	PROJECT_PATTERN_CATALOG,
	recommendServerPlan,
} from '../lib/bootstrap/index';
export type {
	IBlueprintArtifact,
	IBlueprintOptions,
	IBootstrapToolOptions,
	IFileReader,
	IProjectAnalysis,
	IProjectPattern,
	IServerBlueprint,
	IServerPlan,
} from '../lib/bootstrap/index';

// --- versioned skill bundles (f00029 S4; f00065 S1: skills owned by package/plugin) ------
export { loadSkills } from '../lib/skills/load-skills';
export type { ISkillBundle } from '../lib/skills/load-skills';
export {
	buildSkillCatalog,
	extractSkillDescription,
} from '../lib/skills/skill-catalog';
export type {
	ISkillCatalog,
	ISkillCatalogEntry,
} from '../lib/skills/skill-catalog';
export {
	CORE_SKILLS_ROOT,
	ownerRootForAppliesTo,
	pluginSkillsRoot,
	SKILL_MANIFEST_REL,
	skillBodyPath,
	skillOwnerRoots,
} from '../lib/skills/skill-paths';

// --- cross-project setup engine (f00030 S2) -------------------------------
export { renderCrossProjectGuide } from '../lib/setup/cross-project-guide';
export { buildGithubSetupSteps } from '../lib/setup/setup-steps';
export type {
	GithubAuthTier,
	IGithubSetupContext,
	ISetupStep,
} from '../lib/setup/setup-steps';

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
export { aggregateScans } from '../lib/external-tool/aggregate-scans';
export {
	probeTool,
	probeTools,
	realProbeDeps,
} from '../lib/external-tool/probe';
export {
	renderFindingsTable,
	renderFindingSummary,
	sortFindings,
	summarizeFindings,
	toScanResult,
	worstSeverity,
} from '../lib/external-tool/render-findings';
export {
	makeRedactor,
	runExternalTool,
} from '../lib/external-tool/run-external-tool';
export { GH_CLI_TOOL } from '../lib/external-tool/known-tools.constant';
export { runGhCli } from '../lib/external-tool/gh-cli.service';

// --- plugin registry (f00141 S1) ---
export type {
	IPluginRegistryEntry,
	IPluginRegistrySource,
	IResolvePluginsOptions,
	IResolvePluginsResult,
	PluginRegistryOrigin,
} from '../lib/contracts/interfaces/plugin-registry.interface';
export { FIRST_PARTY_PLUGIN_INDEX } from '../lib/registry/first-party-index';
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
export { resolvePlugins } from '../lib/registry/resolve';

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
	describeStableTool,
	findStableDescriptor,
	STABLE_API_TOOL_NAMES,
	STABLE_API_TOOLS,
} from '../lib/api/stable-facade';
export type {
	IStableToolDescriptor,
	TStableSemverGuarantee,
} from '../lib/api/stable-facade';
export {
	buildStableManifest,
	SCHEMA_VERSION,
	STABLE_MANIFEST_REL,
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
	ILogsSink,
	IPluginLogInput,
	IPluginLogsHelper,
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
	emitIncident,
	withIncidentLogging,
} from '../lib/tools/with-incident-logging';
export type {
	IIncidentLoggingContext,
	IWithIncidentLoggingOptions,
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
	fnv1a,
	formatFixProposal,
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
