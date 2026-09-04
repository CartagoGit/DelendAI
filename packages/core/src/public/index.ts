/**
 * Public surface of `@delendai/core`. This barrel is the ONLY
 * stable import surface of the package. Everything under `src/lib` is
 * internal and may change without notice.
 *
 * The core is project-agnostic and knows nothing about proposals,
 * swarms or any domain. Domain behaviour ships as plugins loaded by
 * the CLI (`delendai --plugins=...`) that implement `IMcpPlugin`.
 */

// --- server assembly -------------------------------------------------------
export {
	__resetShutdownGuardForTests,
	gracefulShutdown,
} from '../lib/cli/graceful-shutdown';
export {
	createMcpProject,
	planRegistrationOrder,
} from '../lib/project/create-mcp-project';
export type { IGracefulShutdownOptions, IDelendaiProject } from '../contracts';

// --- workspace + paths -----------------------------------------------------
export { DEFAULT_CORE_PATHS } from '../lib/contracts/interfaces/core-paths.interface';
export {
	isMcpToolSurfaceMode,
	MCP_TOOL_SURFACE_MODE,
} from '../lib/contracts/interfaces/surface-mode.interface';
export type {
	ICorePaths,
	IMcpToolSurfaceMode,
	IWorkspacePathProvider,
} from '../contracts';
export { createWorkspacePathProvider } from '../lib/workspace/create-workspace-path-provider';

// --- projection + handles (v00133 S2) ------------------------------------
export { projectValue } from '../lib/contracts/output/projection';
export type {
	IProjectionRequest,
	IProjectionResult,
	TProjectionMode,
} from '../lib/contracts/output/projection';
export { createInMemoryHandleStore } from '../lib/handles/artifact-handle';
export type {
	IArtifactHandle,
	IHandleOptions,
	IHandleStore,
	THandleReadResult,
} from '../lib/handles/artifact-handle';

// --- contracts -------------------------------------------------------------
export type {
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
	IDelendaiHostConfig,
} from '../lib/contracts/interfaces/host-config.interface';
export type {
	IHostCapabilities,
	IKnowledgeEntry,
	ISkillEntry,
	IPluginConfigExample,
	IDelendaiProjectMetadata,
	IStatusCollector,
	IPromptRegistration,
	IResourceRegistration,
	IToolEffect,
	IToolRegistration,
} from '../contracts';
export type {
	ISafeToolIdentity,
	IToolIdentityRegistry,
	IToolRegistryEntry,
	SafeToolCategory,
	SafeToolId,
	ToolOwner,
} from '../lib/contracts/interfaces/safe-tool-identity.interface';
export type {
	IQualityGate,
	IQualityGateExpect,
	IQualityGateLanguage,
	IQualityGateList,
} from '../lib/contracts/interfaces/quality-gate.interface';
export type {
	// f00057 S11: deprecation marker for tools that have a documented
	// replacement (e.g. docs_search → search_search). Plugins attach it
	// to the registration and the handler returns a typed envelope.
	IToolDeprecationMarker,
	// f00065 slice F: canonical tool-effect union, shared with @delendai/client.
} from '../lib/contracts/interfaces/tool-registration.interface';
export type {
	IValidationCommand,
	IValidationMatrix,
} from '../lib/contracts/interfaces/validation-matrix.interface';
export type {
	IModelCatalog,
	IModelCatalogEntry,
	IModelCatalogFilter,
	IModelCatalogSearchOptions,
	IModelLimits,
	IModelCatalogErrorCode,
	IModelLifecycle,
} from '../lib/contracts/interfaces/model-catalog.interface';
export {
	DEFAULT_MODEL_CATALOG_LIMIT,
	InMemoryModelCatalog,
	MAX_MODEL_CATALOG_LIMIT,
	ModelCatalogError,
} from '../lib/catalog';
export type {
	EvidenceType,
	IEvidenceStore,
} from '../lib/contracts/interfaces/evidence.interface';
export {
	createEvidenceStore,
	EVIDENCE_TYPES,
} from '../lib/evidence/evidence-store';
export type { IEvidenceStoreWithCleanup } from '../lib/evidence/evidence-store';
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
export {
	HostCapabilityRegistry,
	createHostCapabilityRegistry,
} from '../lib/host/host-capability-registry';
export type {
	IHostCapabilityProjection,
	IHostCapabilityKey,
} from '../lib/host/host-capability-registry';
// File-convention profile (f00037 / f00057 S8) — the canonical
// TypeScript rule chain used by both the lint engine and the
// `@delendai/conventions` plugin.
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
export {
	REPOSITORY_GIT_URL,
	REPOSITORY_ISSUES_URL,
	REPOSITORY_NAME,
	REPOSITORY_OWNER,
	REPOSITORY_SLUG,
	REPOSITORY_URL,
} from '../lib/contracts/constants/repository-identity.constant';
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
	IResolvedHostIdentity,
	IWorkspaceLayoutArgs,
	WorkspaceLayoutProbe,
	WorkspacePathStatus,
	PluginOrigin,
	IDelendaiCliArgs,
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
	IActivateContext,
	IPhasedLifecycle,
	IPrepareContext,
} from '../contracts';
export {
	PERMISSION_CATEGORIES,
	PERMISSION_RISK_WEIGHTS,
} from '../lib/contracts/constants/permission-categories.constant';
export type {
	IToolPermissionGrant,
	PermissionCategory,
} from '../lib/contracts/interfaces/permission.interface';
export type { IPluginOriginInput } from '../lib/contracts/interfaces/plugin-origin.interface';
export { buildActivationReport } from '../lib/plugins/activation-report';
export {
	classifyOrigin,
	isFirstPartySpecifier,
} from '../lib/plugins/classify-origin';
export { resolvePublicToolIdentity } from '../lib/contracts/resolvers/safe-tool-identity.resolver';
export { diagnoseWorkspaceLayout } from '../lib/plugins/diagnose-workspace-layout';
export {
	CONFIG_FILE_SCHEMA,
	DEFAULT_AGENT_POLICY,
	DEFAULT_CONFIG_FILENAME,
	diagnoseConfigFile,
	diagnosePluginPathConfig,
	parseConfigFile,
	pluginConfigFor,
	resolveConfigPluginSpecifiers,
} from '../lib/plugins/load-config-file';
export { loadPlugins, resolvePluginSpecifier } from '../plugin';
import { nodeDynamicImport as nodeDynamicImportImpl } from '../node';
/**
 * @deprecated r00028 / b00237 — use `@delendai/core/node` instead.
 * Will be removed in the next minor release.
 */
export const nodeDynamicImport = nodeDynamicImportImpl;
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
} from '../lib/plugins/parse-cli-args';
export { parseCliArgs } from '../plugin';
export { adaptLegacyPlugin } from '../lib/plugins/lifecycle';
export { definePlugin } from '../plugin';
export type {
	IPluginConfigurationIssue,
	IPluginConfigurationValidationInput,
} from '../lib/plugins/plugin-contract';
// (Track D): phased plugin lifecycle.
export {
	hasPhasedLifecycle,
	runLifecycle,
	safeDispose,
} from '../lib/plugins/lifecycle';
export type { IPluginRuntime } from '../lib/contracts/interfaces/plugin-runtime.interface';
export {
	injectCheckpointAdvisory,
	mergeCheckpointAdvisories,
	selectCheckpointAdvisory,
} from '../lib/shared/checkpoint-advisory';
export type {
	BeforeToolCallHook,
	CheckpointAdvisoryProvider,
	CheckpointAdvisorySeverity,
	ICheckpointAdvisoryContext,
} from '../lib/contracts/interfaces/checkpoint-advisory.interface';
export type { ICheckpointAdvisory } from '../contracts';
export { CHECKPOINT_ADVISORY_SEVERITIES } from '../lib/contracts/interfaces/checkpoint-advisory.interface';
export {
	measureBootstrapBytes,
	measureToolWireBytes,
	type IBootstrapMeasurement,
	type IMcpToolWireDefinition,
} from '../lib/surface/bootstrap';
export { compactOutputSchema } from '../lib/surface/compact-output-schema.helper';
export {
	VALIDATE_EVIDENCE_SCHEMA,
	type IValidateEvidenceInput,
} from '../lib/proposals/validate-evidence.schema';
// Shared by every operator-facing boot notice in core AND in the
// plugins, which is why it is public: four copies of the same
// never-throw write loop had grown independently.
export { announceLines } from '../lib/shared/announce-lines';
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
export type { ProjectPackKind } from '../lib/contracts/interfaces/project-signals.interface';

// --- managed-surface startup diagnostics (q00009) -------------------------
export {
	buildStartupReport,
	isStartupReportLevelVisible,
	levelIncludesPluginCostTable,
	renderStartupReport,
	renderStartupReportAnsi,
	renderStartupReportPlain,
	resolveStartupReportLevel,
	shouldUseAnsiColors,
	STARTUP_REPORT_DEFAULT_LEVEL,
	STARTUP_REPORT_LEVELS,
	STARTUP_REPORT_LEVEL_INPUTS,
} from '../lib/startup-report';
export type {
	IStartupReport,
	IStartupReportBaseline,
	IStartupReportBudget,
	IStartupReportCatalogCounts,
	IStartupReportInput,
	IStartupReportLevel,
	IStartupReportLevelInput,
	IStartupReportManagedRuntime,
	IStartupReportServerIdentity,
	IStartupReportWarning,
} from '../lib/startup-report';

// S2: monorepo-wiring writer for first-party plugins.
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
// S4: wiring-doctor (verifier) for first-party plugins.
export type {
	IAssembleCliDeps,
	IAssembledCliConfig,
} from '../lib/cli/assemble';
export { runCli, runDoctor } from '../lib/cli/run-cli';
export type { IDoctorReport } from '../lib/cli/run-cli';
export type {
	IPluginWiringEdit,
	IPluginWiringDiagnostic,
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
	IDelendaiAgentPolicyConfig,
	IDelendaiCoreConfig,
	ILoopDetectorConfig,
	IDelendaiCachePolicyConfig,
	IDelendaiCacheWorktreesConfig,
	IDelendaiConfigFile,
	IDelendaiCorePathsConfig,
	IDelendaiPluginConfig,
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
export {
	buildProjectPluginsCreateToolRegistration,
	buildProjectPluginsInspectToolRegistration,
	buildProjectPluginsRepairToolRegistration,
	PROJECT_PLUGINS_CREATE_INPUT_SCHEMA,
	PROJECT_PLUGINS_INSPECT_INPUT_SCHEMA,
	PROJECT_PLUGINS_REPAIR_INPUT_SCHEMA,
	PROJECT_PLUGINS_OUTPUT_SCHEMA,
} from '../lib/scaffold/project-plugins';
export type {
	IProjectPluginsCreateArgs,
	IProjectPluginsInspectArgs,
	IProjectPluginsRepairArgs,
	IProjectPluginsOptions,
	IProjectPluginsOutput,
} from '../lib/scaffold/project-plugins';
export { extractPlugin } from '../lib/scaffold/extract-plugin';
export type {
	IExtractedTool,
	IExtractPluginOptions,
	IExtractPluginResult,
} from '../lib/scaffold/extract-plugin';
export { scaffoldExtensionHostFiles } from '../lib/scaffold/scaffold-extension-host';
export {
	detectExistingDelendaiInstall,
	findDelendaiServerName,
	isDelendaiLaunchShape,
	resolveHostScaffoldDefaults,
} from '../lib/scaffold/detect-existing-install';
export type { IExistingDelendaiInstall } from '../contracts';
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
	resolveWorkspaceContainedLexical,
} from '../lib/shared/contain-path';
export type { IContainedPath } from '../lib/shared/contain-path';
export {
	realResolvePath,
	realpathContained,
	resolveExistingWorkspaceContained,
} from '../lib/shared/contain-realpath';
export { SafeWorkspaceReader } from '../lib/filesystem/safe-workspace-reader';
export { readAbsoluteTextSafe } from '../lib/filesystem/safe-workspace-reader.helpers';
export { WorkspaceContainmentError } from '../lib/filesystem/safe-workspace-reader.errors';
export type {
	ContainedPathResult,
	ISafeWorkspaceReader,
	SafeListEntry,
	SafeListResult,
	SafeReadResult,
	SafeStatResult,
	WorkspaceContainmentReason,
} from '../lib/filesystem/safe-workspace-reader.types';
export { joinUnderRoot } from '../lib/shared/join-under-root';
export { joinRel } from '../lib/shared/paths';
// S2: batch atomic writer for consumers that want to apply
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
// path is derived, never hardcoded. See `docs/delendai/proposals/
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
export { bootstrapCacheLayout } from '../lib/cache/cache-layout-bootstrap';
export { buildCacheReconcileToolRegistration } from '../lib/tools/cache-reconcile.tool';
export type {
	ICacheEvictionCustom,
	ICacheEvictionErrored,
	ICacheEvictionKeepLastN,
	ICacheEvictionOlderThan,
	ICacheEvictionOlderThanMtime,
	ICacheEvictionRemoved,
	ICacheEvictionReport,
	ICacheEvictionRunOptions,
	ICacheEvictionSkipped,
	ICacheEvictionWhen,
} from '../lib/contracts/interfaces/cache-eviction.interface';
export type { ICacheEvictionRegistry, ICacheEvictionRule } from '../contracts';

// --- peer plugins (loaded-set introspection) ------------------------------
// Plugins that need to gate runtime behaviour on whether another plugin
// is loaded (e.g. an audit plugin deciding whether to scaffold
// proposals via the `proposals` plugin) consult
// `ctx.peerPlugins.list()` / `.has(name)`. The registry is populated
// by the core AFTER `loadPlugins()` returns; at register time it is
// empty.
export type { IEvictionRegistryDeps } from '../lib/cache/eviction-registry';
export {
	killProcessGroup,
	killProcessTree,
} from '../lib/commands/process-group';
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
export {
	HIGH_CONFIDENCE_SECRET_PATTERNS,
	redactSecrets,
} from '../lib/shared/redact';
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

// --- IDE install helper (`delendai init`) ---------------------------------
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
	clearForcePushAuthorizationsForTests,
	commitAndPush,
	createGitRunner as createWriteGitRunner,
	stripAnsi,
	gitAdd,
	gitCommit,
	gitHeadShortHash,
	gitLastCommitAuthor,
	gitPush,
	listForcePushAuthorizations,
} from '../lib/shared/git-write';
export type {
	ICommitOptions,
	IForcePushAuthorizationRecord,
	IPushAuthorization,
	IPushForceMode,
	IPushOptions,
	IGitRunner as IWriteGitRunner,
	IGitRunResult as IWriteGitRunResult,
} from '../lib/shared/git-write';
export type { ICommitAndPushOptions, ICommitAndPushResult } from '../contracts';
// --- commit author policy (f00082) ---
export {
	COMMIT_AUTHOR_MODES,
	type CommitAuthorMode,
	type ICommitAuthorIdentity,
	type ICommitAuthorInput,
	type ICommitAuthorNamed,
} from '../lib/contracts/interfaces/commit-author.interface';
export type { ICommitAuthorResolution } from '../contracts';
export {
	createGitConfigReader,
	resolveCommitAuthor,
} from '../lib/shared/commit-author';
export type { IGitConfigReader } from '../lib/shared/commit-author';

// slice F: the canonical shared git-runner contract. Plugins that used
// to redefine this type (git, proposals) import it from here instead.
export type { IGitRunner, IGitRunResult } from '../contracts';
// Composite agent identity contract. Plugins that produce or
// consume the four-field identity (proposals worktree engine, handoff
// packets, swarm tools) import from here so the contract has one
// source of truth.
export { AGENT_IDENTITY_LIMITS } from '../lib/contracts/interfaces/agent-identity.interface';
export type { AgentHost, IAgentIdentity } from '../contracts';
export {
	assertReleaseMetadata,
	assertReleaseSlug,
	assertReleaseType,
	releaseBranch,
	RELEASE_STATES,
	RELEASE_TYPES,
	slugifyRelease,
	isReleaseType,
	nextVersion,
} from '../lib/contracts/release';
export type {
	IReleaseCandidateMetadata,
	ReleaseState,
	ReleaseType,
} from '../lib/contracts/release';
export {
	assertExpectedReleaseState,
	evaluateReleaseReadiness,
	releaseStatusCompact,
	ReleaseStateError,
} from '../lib/contracts/release-state';
export type {
	IExpectedReleaseState,
	IReleaseGate,
	IReleasePrepareInput,
	IReleasePreparation,
	IReleaseReadiness,
	IReleaseStatusCompact,
	ReleasePrepareMode,
	ReleaseStateErrorCode,
} from '../lib/contracts/release-state';
export {
	assertExpectedFinalReleaseState,
	buildReleaseReceipt,
} from '../lib/contracts/release-finalize';
export type {
	IExpectedFinalReleaseState,
	IHotfixInput,
	IReleaseFinalizeInput,
	IReleaseReceipt,
	IReleaseReconciliationInput,
} from '../lib/contracts/release-finalize';
// S1: the canonical multi-model provider contract. Wiki pages
// 04/05/06/07/08 and both consuming plugins (orchestrator-runner,
// usage-tracking) import the provider vocabulary from this single file so
// there is no drift between the design text and the code.
export { CAPABILITY_TAGS } from '../lib/contracts/interfaces/provider-capabilities.interface';

// --- f00188 (Track F / security): capability schema + enforcement ----
export {
	CAPABILITIES,
	isCapability,
	parseCapability,
	parseCapabilityList,
	splitCapability,
} from '../lib/capabilities/schema';
export type {
	Capability,
	ICapabilityParts,
	ICapabilityRefusal,
	TCapabilityGroup,
} from '../lib/capabilities/schema';
export {
	createCapabilityGate,
	parseDeclaredCapabilities,
	resolveCapabilityAccess,
	summariseLegacyShimWarning,
} from '../lib/capabilities/inject';
export type { ILegacyShimWarning } from '../lib/capabilities/inject';

// --- f00194 (Track K / capability versioning): semver-aware requires ---
export {
	WILDCARD_RANGE,
	buildAvailableVersions,
	checkCapabilityRequirements,
	formatCapabilityVersionRefusal,
	legacyVersionedCapability,
	parseCapabilityRequirement,
	resolveAllCapabilityVersions,
	resolveCapabilityVersion,
} from '../lib/capabilities/versioning';
export type {
	CapabilityRequirement,
	CapabilityVersionResult,
	ICapabilityVersionRefusal,
	ICapabilityVersionResolution,
	IVersionedCapability,
} from '../lib/capabilities/versioning';

// --- f00189 (Track F / security): dryRun transversal protocol -------
export {
	buildDryRunResult,
	dryRunRequiredFor,
	isDryRunResult,
	validateDryRunResult,
} from '../lib/dry-run/protocol';
export type {
	DryRunOrRun,
	IDryRunResult,
	IDryRunResultIssue,
	IPlannedChange,
	IPlannedRun,
	TDryRunRisk,
} from '../lib/dry-run/protocol';
export {
	enforceDryRunReturnContract,
	planDryRun,
	validateToolDryRunManifest,
} from '../lib/dry-run/enforce';
export type {
	IDryRunContractRefusal,
	IDryRunManifestWarning,
} from '../lib/dry-run/enforce';
export {
	DryRunEffectRefusedError,
	guardEffectCapability,
	runWithDryRunGate,
} from '../lib/dry-run/effect-guard.helper';
export type {
	IDryRunEffectRefusal,
	TEffectCapabilityKind,
} from '../lib/dry-run/effect-guard.helper';
// The mandatory capability-injection layer — the ambient
// dry-run scope + the typed effects surface handed to plugins via
// `IMcpPluginContext.effects`.
export {
	getActiveDryRunFlag,
	runWithDryRunScope,
} from '../lib/dry-run/dry-run-scope.helper';
export { createDryRunGatedGitRunner } from '../lib/dry-run/effect-capability-factory.helper';
export type { IPluginEffectsCapability } from '../lib/contracts/interfaces/effect-capabilities.interface';
// r00037 S1 — post-hoc dry-run violations, bounded ring buffer keyed by
// the plugin/tool responsible. Detection, not prevention (see the
// EffectBroker exports below for prevention).
export {
	clearDryRunViolationsForTests,
	listDryRunViolations,
	recordDryRunViolation,
} from '../lib/dry-run/dry-run-violation-log.service';
export type { IDryRunContractViolationRecord } from '../lib/contracts/interfaces/dry-run-violation.interface';
// r00037 S2/S3 — the EffectBroker: the single point of construction for
// every ambient-dry-run-gated capability a plugin context hands out.
export { createEffectBroker } from '../lib/capabilities/effect-broker.factory';
export type {
	IEffectBrokerCapabilityDefinition,
	IEffectBrokerCapabilities,
	IEffectBrokerDefinitions,
} from '../lib/contracts/interfaces/effect-broker.interface';
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
	toolError,
	toolErrorWithLogHint,
	toolJson,
	toolJsonWithSummary,
	toolJsonBounded,
	toolOk,
	truncateIfTooLarge,
} from '../lib/shared/tool-response';
export type {
	IToolErrorLogHint,
	IToolTextResult,
} from '../lib/shared/tool-response';
export type { ICursorPage, IExcerptRange, IPaginatedItems } from '../contracts';
export {
	DEFAULT_COMPACT_RESPONSE_BYTES,
	DEFAULT_MAX_RESPONSE_BYTES,
	MAX_RESPONSE_BYTES_CEILING,
} from '../lib/contracts/constants/response-byte-budget.constant';
export { TOKEN_BUDGETS } from '../lib/contracts/constants/token-budgets.constant';
export type {
	IGovernedToolsListBudget,
	IPresetTokenBudgetProfile,
	ITokenBudgetCeiling,
	ITokenBudgetRegistry,
	ITokenBudgetSurface,
} from '../lib/contracts/constants/token-budgets.constant';
// — transversal `detail: compact | normal | full` contract.
export {
	DETAIL_LEVELS,
	projectDetail,
	UnknownDetailLevelError,
	withDetail,
} from '../lib/contracts/detail.contract';
export type {
	Detail,
	DetailProjection,
	DetailProjections,
	WithDetail,
} from '../lib/contracts/detail.contract';
// — TokenBudgetRegistry + types.
export {
	createTokenBudgetRegistry,
	TokenBudgetRegistry,
} from '../lib/budgets/registry';
export type {
	IMeasureOptions,
	IRegistryOptions,
} from '../lib/budgets/registry';
export { createStaticBytesSource } from '../lib/budgets/sources/static-bytes';
export { createDashboardMockSource } from '../lib/budgets/sources/dashboard-mock';
export {
	TokenBudgetBreachError,
	type IBudgetCeiling,
	type IBudgetForSurface,
	type IBudgetSource,
	type IPerSurfaceMeasurement,
	type ITokenMeasurement,
	type ITokenReport,
	type ITokenReportRow,
	type Surface,
	type TokenSurface,
} from '../lib/budgets/types';
// — Token ROI per plugin (KPI).
export { buildValueLookup } from '../lib/budgets/manifest';
export { aggregateROI, computeROI, confidenceFor } from '../lib/budgets/roi';
export type {
	IComputeRoiInput,
	IRoiConfidence,
	IRoiMeasurement,
	IRoiReport,
	IRoiValueLookup,
} from '../lib/budgets/roi';
export {
	paginateFileExcerpt,
	paginateItems,
} from '../lib/shared/pagination.helper';
export type {
	ITruncatedEnvelope,
	ITruncationResult,
} from '../lib/contracts/interfaces/truncation.interface';
// — Cost-aware routing utility (Track L, P2).
export {
	DEFAULT_UTILITY_WEIGHTS,
	rankCandidates,
	utility,
} from '../lib/routing/utility';
export type {
	IProviderCandidate,
	IRoutingContext,
	IUtilityScore,
	IUtilityWeights,
} from '../lib/routing/utility';
// — Model-aware presets (Track L, P2).
export {
	DEFAULT_MODEL_PROFILES,
	detectModelTier,
	filterToolsByProfile,
	getModelProfile,
	listModelProfiles,
} from '../lib/presets/model-profiles';
export type {
	IModelProfile,
	IModelProfileOverride,
	TModelTier,
} from '../lib/presets/model-profiles';
// — Memory utility score (Track M, P2).
export {
	DEFAULT_MEMORY_COST_THRESHOLD,
	DEFAULT_MEMORY_UTILITY_WEIGHTS,
	filterByUtility,
	utility as computeMemoryUtility,
} from '../lib/memory/utility';
export type {
	IMemoryEntry,
	IMemoryUtilityContext,
	IMemoryUtilityScore,
	IMemoryUtilityWeights,
} from '../lib/memory/utility';

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
	computePayloadPercentile,
	createByteSamplePercentileRegistry,
	PayloadPercentileSchema,
	readMetricsSnapshot,
} from '../lib/metrics/payload-percentile';
export type {
	IByteSamplePercentileRegistry,
	IResettableMetricsRegistry,
	IPayloadPercentile,
	IPayloadPercentileEmpty,
	IPayloadPercentileSampled,
} from '../lib/metrics/payload-percentile';
// (Track D): plugin lifecycle metrics.
export { createPluginMetrics } from '../lib/observability/plugin-metrics';
export type {
	IPluginMetrics,
	IPluginMetricsCounters,
	IPluginMetricsHistogram,
	IPluginMetricsSnapshot,
	PluginEvent,
	PluginHistogramEvent,
} from '../lib/observability/plugin-metrics';
export {
	createJsonlRuntimeEventSink,
	runtimeEventsPath,
	runtimeSessionStarted,
} from '../lib/observability/runtime-events';
export type { RuntimeEventKind } from '../lib/observability/runtime-events';
export type {
	IRuntimeEvent,
	IRuntimeEventSink,
	RuntimeEventInput,
} from '../contracts';
// (Track M): cross-plugin activation KPIs.
export {
	createActivationKpis,
	hydrateKpis,
	intersectSize,
	jaccardDistance,
	precision,
	recall,
	serializeKpis,
} from '../lib/observability/activation-kpis';
export { createActivationKpiSessionStore } from '../lib/observability/activation-kpis-session';
export type {
	IActivationKpiSessionStore,
	IActivationKpiSessionStoreOptions,
} from '../lib/observability/activation-kpis-session';
export type {
	IActivationKpis,
	IAggregateKpis,
	IPersistedKpisFile,
	ISessionKpis,
} from '../lib/observability/activation-kpis';
// (Track M): tool confusion matrix.
export {
	createToolConfusion,
	DEFAULT_RENAME_THRESHOLD,
	hydrateConfusion,
	serializeConfusion,
} from '../lib/observability/tool-confusion';
export type {
	IConfusionMatrix,
	IConfusionPair,
	IPersistedConfusionFile,
	IRenameSuggestion,
	IToolConfusion,
} from '../lib/observability/tool-confusion';
// --- f00192 (Track J / agent timeline): host-agnostic append-only log ---
export {
	DEFAULT_MAX_EVENTS,
	TimelineBuffer,
	formatEventTimestamp,
	isTimelineLog,
	mergeTimelineLogs,
	nowEvent,
	redactFreeText,
	truncateRedactor,
} from '../lib/observability/timeline';
export type {
	ITimelineBufferOptions,
	ITimelineEvent,
	ITimelineLog,
	TimelineEventKind,
} from '../lib/observability/timeline';
export { MigrationError, runMigrations } from '../lib/migrations/migrate';
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
export { buildCodeMapResourceRegistration } from '../lib/code-map/resource';
export type { ICodeMap } from '../lib/code-map/generator';
export { CODE_MAP_SCHEMA_VERSION } from '../lib/code-map/generator';
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
	IProjectAnalysis,
	IProjectPattern,
	IServerBlueprint,
	IServerPlan,
} from '../lib/bootstrap/index';
export type { IFileReader } from '../contracts';

// --- one-call project adoption (f00157 S1) --------------------------------
export { buildAdoptionAssessment } from '../lib/adopt/adoption-assessment.service';
export {
	buildAdoptProjectPlan,
	buildAdoptProjectToolRegistration,
} from '../lib/adopt/adopt-project.tool';
export type {
	IAdoptProjectPlan,
	IAdoptProjectPreset,
	IAdoptProjectToolDeps,
	IBuildAdoptProjectPlanInput,
} from '../contracts';
export type {
	IAssessmentConflict,
	IAssessmentCost,
	IBuildAdoptionAssessmentOptions,
	IPluginRecommendation,
} from '../lib/contracts/interfaces/adoption-assessment.interface';
export type { IAdoptionAssessment } from '../contracts';

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
export { packageSkillSource } from '../lib/skills/sources/package-skill-source';
export { buildSkillResolver } from '../lib/skills/sources/resolver';
export type { ISkillResolver } from '../lib/skills/sources/resolver';
export type {
	ILoadedSkill,
	ISkillDescriptor,
	ISkillResolverListResult,
	ISkillResolverLoadResult,
	ISkillSource,
} from '../lib/skills/sources/types';
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
} from '../contracts';
export type {
	FindingSeverity,
	IAggregatedScan,
	IFindingCounts,
	IFindingLocation,
	IScanResult,
	IScanSkip,
} from '../lib/contracts/interfaces/finding.interface';
export type { IFinding } from '../contracts';
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
export type { IGhCliRun } from '../lib/external-tool/gh-cli.service';

// --- plugin registry (f00141 S1) ---
export type {
	IPluginRegistryEntry,
	IPluginRegistrySource,
	IResolvePluginsOptions,
	IResolvePluginsResult,
	PluginRegistryOrigin,
} from '../lib/contracts/interfaces/plugin-registry.interface';
export type {
	IPluginConfigDocs,
	IPluginManifest,
	IPluginManifestTokenBudget,
	PluginManifestMaturity,
	PluginManifestVisibility,
} from '../lib/contracts/interfaces/plugin-manifest.interface';
// f00502: `init` writes the config file through the JSONC editor and
// derives each plugin's comment from the catalog. Both are public
// because `packages/cli` may only consume the core's public API
// (`lint:cli-imports`).
export {
	applyJsoncEdits,
	detectIndent,
	parseJsonc,
} from '../lib/config/jsonc-document';
export type {
	IJsoncEdit,
	IJsoncParseResult,
	IJsoncSyntaxError,
} from '../lib/config/jsonc-document';
export {
	conventionalPluginDocsPath,
	renderPluginConfigComment,
	resolvePluginConfigDocs,
} from '../lib/plugins/plugin-config-docs';
export type { IResolvedPluginConfigDocs } from '../lib/plugins/plugin-config-docs';
export type {
	IPluginTokenBudget,
	IPluginTokenBudgetCaps,
} from '../lib/contracts/interfaces/plugin-token-budget.interface';
export { resolveTokenBudget } from '../lib/contracts/interfaces/plugin-token-budget.interface';
export type { IPluginToolPermissions } from '../lib/contracts/interfaces/plugin-tool-permissions.interface';
export { resolveToolPermissions } from '../lib/contracts/interfaces/plugin-tool-permissions.interface';
// (Track D): plugin state machine.
export {
	canTransition,
	createPluginStateMachine,
	PluginStateError,
} from '../lib/plugins/states';
export type {
	IPluginStateMachine,
	ITransitionReason,
	PluginState,
} from '../lib/plugins/states';
export {
	definePluginManifest,
	parsePluginManifest,
} from '../lib/manifest/define-plugin-manifest';
export {
	discoverPluginManifests,
	loadAllPluginManifests,
} from '../lib/manifest/discovery';
export { validatePluginManifest } from '../lib/manifest/validation';
export {
	permissionCategorySchema,
	permissionListSchema,
	toolPermissionGrantSchema,
	toolPermissionsSchema,
} from '../lib/manifest/permissions.schema';
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
export { coreFeatureFlag, readFeatureFlag } from '../lib/plugins/feature-flags';
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
// calls without importing from `@delendai/core/lib/...` (the internal
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
// S2: scan helpers - pure utilities adopted by the SOLID-compliance
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
// --- error collection (f00251) -------------------------------------------
export type { IErrorSink } from '../lib/error-collection/sink.interface';
export type {
	IErrorCollector,
	ICreateErrorCollectorOptions,
	IRedactionPolicy,
	ISeverityClassifier,
} from '../lib/error-collection/collector.interface';
export type {
	ICapturedError,
	ICapturedErrorContext,
	ISeverityBand,
	ISinkId,
	IErrorSinkRecordInput,
} from '../lib/error-collection/types';
export type {
	TSeverityBand,
	TClassification,
} from '../lib/error-collection/severity-classifier';
export { createErrorCollector } from '../lib/error-collection/collector.service';
export { ConsoleErrorSink } from '../lib/error-collection/console-sink';
export { BufferingErrorSink } from '../lib/error-collection/buffering-sink';
export { withErrorCollection } from '../lib/error-collection/with-error-collection';
export type {
	IToolMetaForError,
	IWithErrorCollectionOptions,
} from '../lib/error-collection/with-error-collection';
export { createDefaultRedactionPolicy } from '../lib/error-collection/redaction-policy';
export { createDefaultSeverityClassifier } from '../lib/error-collection/severity-classifier';
// (Track N): generic mutation idempotency store.
export {
	createIdempotencyStore,
	duplicateSuppressedRefusal,
	IDEMPOTENCY_DUPLICATE_SUPPRESSED,
	readIdempotencyFile,
	writeIdempotencyFile,
} from '../lib/mutations/idempotency';
export type {
	IIdempotencyFile,
	IIdempotencyOptions,
	IIdempotencyRecord,
	IIdempotencySnapshot,
	IIdempotencyStore,
} from '../lib/mutations/idempotency';

// --- f00201 (Track O / q00006 §55): workflow transactions -----------
export { plan, execute, computePlanRisk } from '../lib/transactions/plan';
export type {
	ICompensationContext,
	ICompensationRecord,
	IExecuteOptions,
	IStep,
	IStepContext,
	ITransactionError,
	ITransactionPlan,
	ITransactionResult,
	StepEffect,
	TTransactionRisk,
} from '../lib/transactions/types';
export type { IExecuteResult } from '../lib/transactions/executor';
