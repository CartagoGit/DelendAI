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
export type { IDelendaiProject } from '../contracts';

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
} from '../lib/contracts/output/projection';
export { createInMemoryHandleStore } from '../lib/handles/artifact-handle';
export type {
	IArtifactHandle,
	IHandleStore,
} from '../lib/handles/artifact-handle';

// --- contracts -------------------------------------------------------------
export type { IHostCapabilityProfile } from '../lib/contracts/interfaces/host-capabilities.interface';
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
	IValidationCommand,
	IValidationMatrix,
} from '../lib/contracts/interfaces/validation-matrix.interface';
export {
	DEFAULT_MODEL_CATALOG_LIMIT,
	InMemoryModelCatalog,
	MAX_MODEL_CATALOG_LIMIT,
	ModelCatalogError,
} from '../lib/catalog';
export type { IEvidenceStore } from '../lib/contracts/interfaces/evidence.interface';
export { buildHostAdapterPack } from '../lib/hosts/host-adapter-pack';
export type { IHostAdapterPack } from '../lib/hosts/host-adapter-pack';
export { buildHostCapabilityPlan } from '../lib/hosts/host-capability-profile';
export { createHostCapabilityRegistry } from '../lib/host/host-capability-registry';
export type {
	IHostCapabilityManifest,
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
	REPOSITORY_NAME,
	REPOSITORY_OWNER,
	REPOSITORY_SLUG,
	REPOSITORY_URL,
} from '../lib/contracts/constants/repository-identity.constant';
export type {
	IActivationSources,
	ILoadedPluginFacts,
} from '../lib/contracts/interfaces/activation-report.interface';
export type {
	ConfigurationArtifactKind,
	IConfigurationArtifact,
	IConfigurationCenterResult,
	IConfigurationPlugin,
	IResolvedHostIdentity,
	PluginOrigin,
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
	IPhasedLifecycle,
} from '../contracts';
export {
	PERMISSION_CATEGORIES,
	PERMISSION_RISK_WEIGHTS,
} from '../lib/contracts/constants/permission-categories.constant';
export type { PermissionCategory } from '../lib/contracts/interfaces/permission.interface';
export { isFirstPartySpecifier } from '../lib/plugins/classify-origin';
export { resolvePublicToolIdentity } from '../lib/contracts/resolvers/safe-tool-identity.resolver';
export { managedPluginEnvironmentRequirements } from '../lib/plugins/managed-plugin-environment';
// @adopter-api a host that assembles its own agent prompt reads the policy the server applies when a project states none
export {
	CONFIG_FILE_SCHEMA,
	DEFAULT_AGENT_POLICY,
	DEFAULT_CONFIG_FILENAME,
	diagnoseConfigFile,
	parseConfigFile,
} from '../lib/plugins/load-config-file';
export { loadPlugins, resolvePluginSpecifier } from '../plugin';
import { nodeDynamicImport as nodeDynamicImportImpl } from '../node';
/**
 * @deprecated r00028 / b00237 — use `@delendai/core/node` instead.
 * Will be removed in the next minor release.
 */
export const nodeDynamicImport = nodeDynamicImportImpl;
export {
	PACK_DEFAULTS,
	resolveSearchHybridWeights,
} from '../lib/plugins/pack-defaults';
export {
	describeStackPacks,
	PACK_DEFAULTS_OVERLAY,
	PACK_IDS,
} from '../lib/plugins/pack-defaults-overlay';
export type { IStackPackMeta } from '../lib/plugins/pack-defaults-overlay';
export { hasExplicitPluginSurfaceSelection } from '../lib/plugins/parse-cli-args';
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
export { mergeCheckpointAdvisories } from '../lib/shared/checkpoint-advisory';
export type { ICheckpointAdvisory } from '../contracts';
export {
	measureBootstrapBytes,
	measureToolWireBytes,
	type IBootstrapMeasurement,
	type IMcpToolWireDefinition,
} from '../lib/surface/bootstrap';
export { compactOutputSchema } from '../lib/surface/compact-output-schema.helper';
export { VALIDATE_EVIDENCE_SCHEMA } from '../lib/proposals/validate-evidence.schema';

// Shared by every operator-facing boot notice in core AND in the
// plugins, which is why it is public: four copies of the same
// never-throw write loop had grown independently.
export { announceLines } from '../lib/shared/announce-lines';
// `resolvePluginOptions` only: the raw map is core's internal registry,
// and publishing it invites a consumer to read entries out of it and keep
// a copy — which is the pattern these defaults were just cleaned of. Ask
// the function; it is the one answer.
export { resolvePluginOptions } from '../lib/plugins/plugin-defaults';
export {
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
	renderStartupReportAnsi,
	renderStartupReportPlain,
	shouldUseAnsiColors,
} from '../lib/startup-report';
// The ten `IStartupReport*` types are deliberately NOT re-exported here.
// Every consumer in this workspace — `lib/cli/assemble.ts` and the
// startup-report specs alike — imports them from
// `@delendai/core/lib/startup-report/model`, which is where they are
// declared. Publishing a second name for the same type bought nothing
// and cost ten of this barrel's budget. (x00567)

// S2: monorepo-wiring writer for first-party plugins.
export {
	buildTsconfigPathsEntry,
	pluginDir,
	wirePluginIntoMonorepo,
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
export type {
	IPluginWiringFs,
	IPluginWiringReport,
} from '../lib/contracts/interfaces/plugin-wiring.interface';
export type {
	IBootstrapPatternOverride,
	IBootstrapPatternOverrides,
	IFilesystemConfig,
	ILoopDetectorConfig,
	IDelendaiCachePolicyConfig,
	IDelendaiCorePathsConfig,
	IValidationMatrixConfig,
	IValidationMatrixScope,
} from '../lib/plugins/load-config-file';
export { diagnosePluginWiring } from '../lib/scaffold/diagnose-plugin-wiring';

// --- scaffolding kit ("tools to create tools/plugins") ---------------------
export {
	buildCreatePluginToolRegistration,
	CREATE_PLUGIN_INPUT_SCHEMA,
	runCreatePlugin,
} from '../lib/scaffold/create-plugin.tool';
export type { IRegenerateCatalogArgs } from '../lib/scaffold/create-plugin.tool';
export {
	buildProjectPluginsCreateToolRegistration,
	buildProjectPluginsInspectToolRegistration,
	buildProjectPluginsRepairToolRegistration,
	PROJECT_PLUGINS_CREATE_INPUT_SCHEMA,
} from '../lib/scaffold/project-plugins';
export { scaffoldExtensionHostFiles } from '../lib/scaffold/scaffold-extension-host';
export {
	detectExistingDelendaiInstall,
	findDelendaiServerName,
	isDelendaiLaunchShape,
	resolveHostScaffoldDefaults,
} from '../lib/scaffold/detect-existing-install';
export {
	scaffoldAgentFile,
	scaffoldClaudeAgentFile,
	scaffoldClientFiles,
	scaffoldCodexAgentFile,
	scaffoldHostProject,
	scaffoldPluginFiles,
	scaffoldPromptFile,
	scaffoldSkillFile,
	scaffoldToolFile,
} from '../lib/scaffold/scaffold-host';
export type { IScaffoldPluginOptions } from '../lib/scaffold/scaffold-host';
export { buildScaffoldReport } from '../lib/scaffold/scaffold-tool';
export { buildStandaloneCoreToolRegistrations } from '../lib/scaffold/standalone-core-tools';
export type { IScaffoldToolOptions } from '../lib/scaffold/scaffold-tool';

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
	realpathContained,
	resolveExistingWorkspaceContained,
} from '../lib/shared/contain-realpath';
export { SafeWorkspaceReader } from '../lib/filesystem/safe-workspace-reader';
export { readAbsoluteTextSafe } from '../lib/filesystem/safe-workspace-reader.helpers';
export { WorkspaceContainmentError } from '../lib/filesystem/safe-workspace-reader.errors';
export type { ContainedPathResult } from '../lib/filesystem/safe-workspace-reader.types';
export { joinUnderRoot } from '../lib/shared/join-under-root';
export { joinRel } from '../lib/shared/paths';
// S2: batch atomic writer for consumers that want to apply
// scaffolded files outside an MCP session.
export { createFileSystemBatchWriter } from '../lib/shared/batch-atomic-writer';
// Types shared with `@delendai/core/contracts` route through that barrel
// so each one has a single canonical home. `packages/client` is forbidden
// from taking types out of this barrel, and the contracts subpath is the
// alternative that rule names.
export type {
	IBatchAtomicWriter,
	IBatchOperation,
	IBatchWriteResult,
	ICatalogSnapshot,
	IDelendaiConfigFile,
	IDelendaiPluginConfig,
	IProposalSummary,
	IScaffoldedFile,
	ISkillSummary,
	IToolSummary,
} from '../contracts';

// --- ephemeral exec paths (f00080) -----------------------------------------
// Canonical home for artefacts a plugin or agent creates, runs (or
// parses), and then deletes. Resolves through `IMcpPluginContext` so the
// path is derived, never hardcoded. See `docs/delendai/proposals/
// done/f00080-canonical-ephemeral-exec-paths-in-plugin-cache.md`.
export {
	pruneExpiredExec,
	resolveExecPath,
	withEphemeralExec,
} from '../lib/shared/exec-path';

// --- cache eviction (f00068 slice A) ---------------------------------------
// Declarative policy layer over the shared `<cacheDir>` root. Plugins
// contribute rules via `ctx.cacheEvictionRegistry.register(rule)`; the
// core boot sweep runs a dry-run after every plugin has loaded.
export { createCacheEvictionRegistry } from '../lib/cache/eviction-registry';
export type { ICacheEvictionReport } from '../lib/contracts/interfaces/cache-eviction.interface';
export type { ICacheEvictionRegistry, ICacheEvictionRule } from '../contracts';

// --- peer plugins (loaded-set introspection) ------------------------------
// Plugins that need to gate runtime behaviour on whether another plugin
// is loaded (e.g. an audit plugin deciding whether to scaffold
// proposals via the `proposals` plugin) consult
// `ctx.peerPlugins.list()` / `.has(name)`. The registry is populated
// by the core AFTER `loadPlugins()` returns; at register time it is
// empty.
export {
	killProcessGroup,
	killProcessTree,
} from '../lib/commands/process-group';
export type { IRunArgvOutcome } from '../lib/contracts/interfaces/run-command.interface';
export type { IPeerPluginRegistry } from '../lib/plugins/plugin-contract';
export {
	fsRead,
	fsWrite,
} from '../lib/shared/fs-tools';
export {
	safeRename,
	SafeRenameTargetExistsError,
} from '../lib/shared/safe-rename';
export {
	safeListDir,
	safeListDirNames,
	safePathExists,
	safeListDirRequired,
	SafeListDirReadFailed,
} from '../lib/shared/safe-list-dir';
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
export { runArgv, runCommand } from '../lib/shared/run-command';
export { walkAllowedFiles } from '../lib/shared/walk-allowed-files';

// --- IDE install helper (`delendai init`) ---------------------------------
export { targetById } from '../lib/install/ide-targets';
export {
	buildServerEntry,
	detectOs,
	installToTarget,
	runInstall,
} from '../lib/install/installer';
export type {
	IInstallOptions,
	IInstallReport,
	IRunnerVia,
} from '../lib/install/installer';
export { mergeServerEntry } from '../lib/install/merge-config';
export type { IMcpConfigKind } from '../lib/install/merge-config';

export {
	LockContentionError,
	withFileMutex,
} from '../lib/shared/with-file-mutex';
export { withFileMutexes } from '../lib/shared/with-file-mutexes';
export type { IFileMutexOptions } from '../lib/shared/with-file-mutex';

// --- write-side git primitives (S9: git_commit/git_push, auto_work persist) ---
export {
	commitAndPush,
	createGitRunner as createWriteGitRunner,
	stripAnsi,
	gitAdd,
	gitCommit,
	gitHeadShortHash,
	gitLastCommitAuthor,
	gitPush,
} from '../lib/shared/git-write';
export type {
	IPushAuthorization,
	IPushForceMode,
} from '../lib/shared/git-write';
export type { ICommitAndPushResult } from '../contracts';
// --- commit author policy (f00082) ---
export type {
	CommitAuthorMode,
	ICommitAuthorIdentity,
	ICommitAuthorInput,
	ICommitAuthorNamed,
} from '../lib/contracts/interfaces/commit-author.interface';
export type { ICommitAuthorResolution } from '../contracts';

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
	releaseBranch,
	slugifyRelease,
	nextVersion,
} from '../lib/contracts/release';
export type {
	IReleaseCandidateMetadata,
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
} from '../lib/contracts/release-state';
export {
	assertExpectedFinalReleaseState,
	buildReleaseReceipt,
} from '../lib/contracts/release-finalize';
export type {
	IExpectedFinalReleaseState,
	IHotfixInput,
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
export type { Capability } from '../lib/capabilities/schema';
export {
	createCapabilityGate,
	parseDeclaredCapabilities,
	resolveCapabilityAccess,
	summariseLegacyShimWarning,
} from '../lib/capabilities/inject';

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
export type { IVersionedCapability } from '../lib/capabilities/versioning';

// --- f00189 (Track F / security): dryRun transversal protocol -------
export {
	buildDryRunResult,
	dryRunRequiredFor,
	isDryRunResult,
	validateDryRunResult,
} from '../lib/dry-run/protocol';
export type { IDryRunResult } from '../lib/dry-run/protocol';
export {
	enforceDryRunReturnContract,
	planDryRun,
	validateToolDryRunManifest,
} from '../lib/dry-run/enforce';
export {
	DryRunEffectRefusedError,
	guardEffectCapability,
	runWithDryRunGate,
} from '../lib/dry-run/effect-guard.helper';
export type { TEffectCapabilityKind } from '../lib/dry-run/effect-guard.helper';
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
// The code a write refused in the shared checkout carries, for a caller
// that must tell policy from a broken tool (`verify:tools`).
export { SHARED_CHECKOUT_WRITE_REFUSED } from '../lib/contracts/constants/write-refusal.constant';
export type {
	IToolErrorLogHint,
	IToolTextResult,
} from '../lib/shared/tool-response';
export {
	DEFAULT_COMPACT_RESPONSE_BYTES,
	DEFAULT_MAX_RESPONSE_BYTES,
	MAX_RESPONSE_BYTES_CEILING,
} from '../lib/contracts/constants/response-byte-budget.constant';
export { TOKEN_BUDGETS } from '../lib/contracts/constants/token-budgets.constant';
export type {
	IGovernedToolsListBudget,
	ITokenBudgetCeiling,
	ITokenBudgetRegistry,
	ITokenBudgetSurface,
} from '../lib/contracts/constants/token-budgets.constant';
// — transversal `detail: compact | normal | full` contract.
export {
	DETAIL_LEVELS,
	projectDetail,
} from '../lib/contracts/detail.contract';
export type {
	Detail,
	DetailProjection,
	DetailProjections,
} from '../lib/contracts/detail.contract';
// — TokenBudgetRegistry + types.
export { TokenBudgetRegistry } from '../lib/budgets/registry';
export type { IRegistryOptions } from '../lib/budgets/registry';
export type {
	IBudgetCeiling,
	IBudgetSource,
	IPerSurfaceMeasurement,
	ITokenMeasurement,
	ITokenReport,
	ITokenReportRow,
	Surface,
	TokenSurface,
} from '../lib/budgets/types';
// — Token ROI per plugin (KPI).
export { buildValueLookup } from '../lib/budgets/manifest';
export { aggregateROI } from '../lib/budgets/roi';
export type { IRoiMeasurement } from '../lib/budgets/roi';
export {
	paginateFileExcerpt,
	paginateItems,
} from '../lib/shared/pagination.helper';
export type { ITruncatedEnvelope } from '../lib/contracts/interfaces/truncation.interface';
// — Cost-aware routing utility (Track L, P2).
export {
	rankCandidates,
	utility,
} from '../lib/routing/utility';
export type { IProviderCandidate } from '../lib/routing/utility';
// — Model-aware presets (Track L, P2).
export { detectModelTier } from '../lib/presets/model-profiles';
export type { TModelTier } from '../lib/presets/model-profiles';
// — Memory utility score (Track M, P2).
export type { IMemoryEntry } from '../lib/memory/utility';

// --- core meta-tools (overview / knowledge / validation matrix) ------------
export { buildCatalog } from '../lib/catalog/agent-discovery-catalog';
export {
	ACTIONABLE_PROPOSAL_STATUSES,
	PROPOSAL_STATUS_VALUES,
} from '../lib/catalog/agent-discovery-types';
export type {
	CatalogSection,
	ICatalogSources,
	ProposalStatus,
} from '../lib/catalog/agent-discovery-types';
export type { IMetricsSnapshot } from '../lib/metrics/metrics-registry';
export { buildMetricsToolRegistration } from '../lib/metrics/metrics-tool';
export {
	computePayloadPercentile,
	createByteSamplePercentileRegistry,
	PayloadPercentileSchema,
	readMetricsSnapshot,
} from '../lib/metrics/payload-percentile';
export type { IPayloadPercentile } from '../lib/metrics/payload-percentile';
// (Track D): plugin lifecycle metrics.
export { createPluginMetrics } from '../lib/observability/plugin-metrics';
export type { IPluginMetricsSnapshot } from '../lib/observability/plugin-metrics';
export type {
	IRuntimeEvent,
	RuntimeEventInput,
} from '../contracts';
// (Track M): cross-plugin activation KPIs.
export {
	hydrateKpis,
	precision,
	recall,
} from '../lib/observability/activation-kpis';
export type { IAggregateKpis } from '../lib/observability/activation-kpis';
// (Track M): tool confusion matrix.
// The five `IConfusion*` / `IToolConfusion` shapes are deliberately NOT
// re-exported. The only consumer in this workspace is the module's own
// spec, and it imports them from the declaration site — so publishing a
// second name for them bought nothing and cost five of this barrel's
// budget. They remain reachable at `lib/observability/tool-confusion`.
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
	ITimelineEvent,
	ITimelineLog,
	TimelineEventKind,
} from '../lib/observability/timeline';
export { MigrationError, runMigrations } from '../lib/migrations/migrate';
export type { IMigrator } from '../lib/migrations/migrate';
export { migrateJsonFile } from '../lib/migrations/migrate-file';
export { buildCodeMapResourceRegistration } from '../lib/code-map/resource';
export type { ICodeMap } from '../lib/code-map/generator';
export { CODE_MAP_SCHEMA_VERSION } from '../lib/code-map/generator';
export type { IOverviewSnapshot } from '../lib/tools/overview-tool';
export { buildStatusToolRegistration } from '../lib/tools/status-tool';

// --- hybrid project analyzer (bootstrap) -----------------------------------
export {
	analyzeProject,
	createWorkspaceFileReader,
	recommendServerPlan,
} from '../lib/bootstrap/index';
export type { IProjectAnalysis } from '../lib/bootstrap/index';
export type { IFileReader } from '../contracts';

// --- one-call project adoption (f00157 S1) --------------------------------
export { buildAdoptionAssessment } from '../lib/adopt/adoption-assessment.service';
export { buildAdoptProjectPlan } from '../lib/adopt/adopt-project.tool';

// --- versioned skill bundles (f00029 S4; f00065 S1: skills owned by package/plugin) ------
export { loadSkills } from '../lib/skills/load-skills';
export {
	SKILL_MANIFEST_REL,
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
// ("alternative buffer") failure mode. Plugins and swarm agents import
// `withShellFallback` and the Ring-3 intent adapter from here.
export {
	detectStuckShell,
	mapShellIntentToTool,
	STUCK_SHELL_SENTINELS,
	withShellFallback,
} from '../lib/agents/shell-fallback';

// --- shared external-tool / scanner core (r00012) --------------------------
// One runner + one probe + one finding shape that security, deps-audit,
// perf, forge, browser and database all compose, so a scanner is a thin
// adapter (raw tool output → IFinding[]) instead of re-implementing
// subprocess + parse + presence + install-hint each time.
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
	IScanResult,
} from '../lib/contracts/interfaces/finding.interface';
export type { IFinding } from '../contracts';
export { aggregateScans } from '../lib/external-tool/aggregate-scans';
export {
	probeTool,
	realProbeDeps,
} from '../lib/external-tool/probe';
export {
	sortFindings,
	summarizeFindings,
	toScanResult,
	worstSeverity,
} from '../lib/external-tool/render-findings';
export { runExternalTool } from '../lib/external-tool/run-external-tool';
export { runGhCli } from '../lib/external-tool/gh-cli.service';

// --- plugin registry (f00141 S1) ---
export type {
	IPluginRegistryEntry,
	IPluginRegistrySource,
} from '../lib/contracts/interfaces/plugin-registry.interface';
/**
 * @adopter-api a plugin declares, in its manifest, which copy of each
 * fact it keeps is the authority — including facts it keeps in an
 * adopting project's repository. The manifest field is the consumer;
 * these name its shape for a plugin that builds declarations in code.
 */
export type {
	IAuthorityDeclaration,
	IAuthorityProjection,
} from '../lib/contracts/interfaces/authority.interface';
export type { IPluginManifest } from '../lib/contracts/interfaces/plugin-manifest.interface';
// `init` writes the config file through the JSONC editor and
// derives each plugin's comment from the catalog. Both are public
// because `packages/cli` may only consume the core's public API
// (`lint:cli-imports`).
export {
	applyJsoncEdits,
	parseJsonc,
} from '../lib/config/jsonc-document';
export type { IJsoncEdit } from '../lib/config/jsonc-document';
export { renderPluginConfigComment } from '../lib/plugins/plugin-config-docs';
export type { IPluginTokenBudget } from '../lib/contracts/interfaces/plugin-token-budget.interface';
export { resolveTokenBudget } from '../lib/contracts/interfaces/plugin-token-budget.interface';
export type { IPluginToolPermissions } from '../lib/contracts/interfaces/plugin-tool-permissions.interface';
export { resolveToolPermissions } from '../lib/contracts/interfaces/plugin-tool-permissions.interface';
// (Track D): plugin state machine.
export {
	canTransition,
	createPluginStateMachine,
	PluginStateError,
} from '../lib/plugins/states';
export type { PluginState } from '../lib/plugins/states';
export {
	definePluginManifest,
	parseAuthorityDeclarations,
	parsePluginManifest,
} from '../lib/manifest/define-plugin-manifest';
export {
	discoverPluginManifests,
	loadAllPluginManifests,
} from '../lib/manifest/discovery';
export { validatePluginManifest } from '../lib/manifest/validation';
export { FIRST_PARTY_PLUGIN_INDEX } from '../lib/registry/first-party-index';
export {
	buildPluginAddRecipe,
	type IPluginAddRecipe,
	type IPluginAddStep,
} from '../lib/registry/plugin-add';
export { buildPluginSearchRegistration } from '../lib/registry/plugin-search.tool';
export { resolvePlugins } from '../lib/registry/resolve';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';

// --- f00152 S5 (L3): feature flags ---
export { coreFeatureFlag } from '../lib/plugins/feature-flags';
export type { IFeatureFlagEntry } from '../lib/plugins/feature-flags';

// --- f00152 S2 (L4): stable API facade ---
export {
	describeStableTool,
	findStableDescriptor,
	STABLE_API_TOOL_NAMES,
	STABLE_API_TOOLS,
} from '../lib/api/stable-facade';
export type { IStableToolDescriptor } from '../lib/api/stable-facade';
export {
	buildStableManifest,
	SCHEMA_VERSION,
	STABLE_MANIFEST_REL,
} from '../lib/api/stable-manifest';
export type {
	IStableManifest,
	IStableManifestTool,
} from '../lib/api/stable-manifest';

// --- f00154 S1: incident-driven types (formerly internal to plugin-contract) ---
// Third-party plugin authors need these to type their `ctx.logs.log(...)`
// calls without importing from `the core internal tree` (the internal
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
export { withIncidentLogging } from '../lib/tools/with-incident-logging';
export type { IIncidentLoggingContext } from '../lib/tools/with-incident-logging';
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
	shingleBlocks,
	toRelPosix,
	walkTsFiles,
} from '../lib/scan';
export type { IWalkTsFilesOptions } from '../lib/scan';
// --- error collection (f00251) -------------------------------------------
export type { IErrorSink } from '../lib/error-collection/sink.interface';
export type { IErrorCollector } from '../lib/error-collection/collector.interface';
export type { ICapturedError } from '../lib/error-collection/types';
export { createErrorCollector } from '../lib/error-collection/collector.service';
export { ConsoleErrorSink } from '../lib/error-collection/console-sink';
export { BufferingErrorSink } from '../lib/error-collection/buffering-sink';
export { withErrorCollection } from '../lib/error-collection/with-error-collection';
export { createDefaultRedactionPolicy } from '../lib/error-collection/redaction-policy';
// (Track N): generic mutation idempotency store.

// --- f00201 (Track O / q00006 §55): workflow transactions -----------
export { plan, execute, computePlanRisk } from '../lib/transactions/plan';
export type {
	IStep,
	ITransactionResult,
} from '../lib/transactions/types';

// --- q00022 (x00510 S1.5): workspace-migration public API -----------
// CLI + migrate command + rebrand-propagate script need to import these
// symbols through the public barrel (lint:cli-imports forbids direct
// `core internal` imports from consumer code). The interfaces and
// helpers below are already first-party and stable; we only re-export.
export {
	DEFAULT_MIGRATIONS,
	createFileSystemJournal,
} from '../lib/workspace-migration/migration-registry';
export {
	runPendingMigrations,
	ensureWorkspaceMigrated,
} from '../lib/workspace-migration/legacy-migration.service';
export type { IMigrationRunResult } from '../lib/contracts/interfaces/workspace-migration.interface';
export {
	writeManifest,
	readLatestManifestFromDisk,
} from '../lib/workspace-migration/transaction/migration-manifest';
export type { IStoredMigrationManifest } from '../lib/workspace-migration/transaction/migration-manifest';
export type { ITransactionOutcome } from '../lib/workspace-migration/transaction/migration-transaction';
export {
	createDefaultPhases,
	runMigrationTransaction,
	rollbackLatestMigration,
} from '../lib/workspace-migration/transaction/migration-transaction';
export { scanLegacyIdentity } from '../lib/workspace-migration/scanner/legacy-identity-scanner';

/* --------------------------------------------------------------
 * x00530 S3 — surfaces that plugins previously reached through
 * `the core internal tree`.
 *
 * `@delendai/core` publishes only the subpaths `.`, `./version`,
 * `./public`, `./cli`, `./manifest`, `./contracts`, `./runtime`,
 * `./plugin` and `./node`. There is no `./lib/*` entry, so every
 * `the core internal tree` import resolved only inside this
 * monorepo and would 404 for anyone installing the package from
 * npm. The symbols below are the ones first-party plugins were
 * deep-importing; they are part of the supported plugin surface
 * and are re-exported here so the deep import is unnecessary.
 * -------------------------------------------------------------- */

export {
	isLockEntryExpired,
	isLockEntryStale,
	isLockEntryOrphaned,
} from '../lib/shared/lock-entry-expiry';
export type { ILockExpiryPolicy } from '../lib/contracts/interfaces/lock-entry-expiry.interface';

export { waitsBackOnto, findWaitForCycles } from '../lib/shared/wait-for-graph';
export type { IWaitForEdge } from '../lib/contracts/interfaces/wait-for-graph.interface';

export { registerAdoptionExtensions } from '../lib/adopt/adoption-extension-registry';
export type {
	IAdoptionExtension,
	IAdoptionPlanExtension,
	IApplyAdoptionExtensionInput,
} from '../lib/adopt/adoption-extension-registry';

export { registerWorkflowContribution } from '../lib/cli/workflow-contribution-assembly';
export type { IAssembleWorkflowContributionsInput } from '../lib/cli/workflow-contribution-assembly';
export { readProposalsIndex } from '../lib/cli/read-proposals-index';
export type { IWorkflowContribution } from '../lib/contracts';

export { CONTRACT_MIGRATION_PHASES } from '../lib/contracts';
export type {
	ContractMigrationImpact,
	ContractMigrationPhase,
	IContractMigrationPolicyInput,
	IContractMigrationPolicyVerdict,
	IContractMigrationSliceGuidance,
	IWorktreeImpactPolicyInput,
	IWorktreeImpactPolicyVerdict,
} from '../lib/contracts';

export { registerStableToolDescriptors } from '../lib/api/stable-facade';
export { resolveWorkspaceContainedEffective } from '../lib/security/effective-containment';
export { estimateResponseBytes } from '../lib/metrics/metrics-registry';

/**
 * The canonical development policy, the WIP ref engine, the startup gate
 * and the reconciler — the parts of them that something outside this
 * package actually calls.
 *
 * This block used to publish the whole vocabulary of all four
 * subsystems: every strategy union, every `IPolicy*` slice, every seam
 * interface, every startup phase constant. The rationale written above
 * it said "the runtime, the guards, the generated forge governance and
 * the tooling all have to read the SAME resolved answer" — but a sweep
 * of `plugins/`, `apps/`, `tools/`, `extensions/` and the sibling
 * packages found ZERO importers for about sixty of them. They were
 * published in case somebody needed them, and `lint:core-public-surface-budget`
 * is the gate that exists to notice exactly that: it went 55 over.
 *
 * Every public export is a compatibility commitment, so the ones below
 * are the ones with a caller. Anything else stays reachable at
 * `@delendai/core/lib/...` for this repo's own code, and comes back here
 * the moment something outside the package needs it — with the caller as
 * the justification rather than the anticipation of one.
 */
export type { IResolvedDevelopmentPolicy } from '../lib/contracts/interfaces/development-policy.interface';
export { expandProfile } from '../lib/development-policy/profiles';
export {
	persistenceRouteKind,
	resolveDevelopmentPolicy,
} from '../lib/development-policy/resolve';
export { validateDevelopmentPolicy } from '../lib/development-policy/validate';
/**
 * Whether a proposal becomes one pull request or one per slice. Public so
 * `work publish` applies the one rule instead of restating it.
 */
export { publicationUnitFor } from '../lib/development-policy/publication-unit';
/**
 * A work model an agent has to infer is one it will infer wrong: two
 * projects on different profiles are identical on disk. The declaration
 * was reachable only from this repository's own CLI, so every other
 * project shipped the ambiguity it exists to remove.
 */
export {
	briefWorkModel,
	declareWorkflow,
	renderWorkflowDeclaration,
} from '../lib/development-policy/declare-workflow';
export {
	deriveDefaultProtectedBranches,
	distinctReleaseBranch,
	UNRESOLVED_POLICY_PROTECTED_BRANCHES,
	UNRESOLVED_POLICY_RELEASE_BRANCH,
} from '../lib/development-policy/protected-branches';
export {
	anchorFromPolicy,
	anchorRefusal,
	createOrUpdateWipRef,
	createWipEngine,
	observeAnchor,
	UNANCHORED,
} from '../lib/wip-engine/index';
// Shared with the plugin surface, so it is routed through it: one value,
// one path, whichever entry point a caller uses.
export { validateScopePaths } from '../plugin';
// `createWipEngine` was public while the type it returns was not, so no
// caller outside core could hold one (x00553).
export type { IWipEngine } from '../lib/wip-engine/index.interface';
export type { IAnchorRequirement } from '../lib/wip-engine/anchor.interface';
export { resolveWorkRef } from '../lib/wip-engine/ref-name';
export { WORK_REF_NAMING } from '../lib/contracts/constants/work-ref-naming.constant';
// Publishing a unit and the host's cadence push both write a work ref's
// remote copy; this is how they keep out of each other's way.
// Work refs reach the remote the same way whoever pushes them: the
// periodic publisher every server starts (`createMcpProject`), and
// commit-policy's checkpoints.
export { DURABILITY_REMOTE_MISSING } from '../lib/wip-engine/durability-remote.constant';
export { resolveDurabilityRemote } from '../lib/wip-engine/durability-remote';
export {
	localRefHolds,
	publishWorkRef,
} from '../lib/wip-engine/work-ref-publication';
/**
 * x00560: ONE answer to "who is working", reused by the plugin, the CLI
 * and the host. A ref named after a machine is not an answer.
 *
 * Only the resolver is published. The marker, the normaliser and the
 * shapes are reachable from `@delendai/core/lib/work-identity/...` for
 * anything inside this repository, and stay OFF the compatibility
 * surface until an adopter actually needs them — a published export is a
 * commitment, and the budget for those is already over.
 */
export { resolveWorkAgentId } from '../lib/work-identity/resolve-work-agent.service';
/**
 * The integration engine was not on this surface at all.
 *
 * `createWipEngine` is exported just above, so an agent in ANY project
 * could checkpoint work to a ref — and then had no way to land it,
 * because the engine that integrates was reachable only from inside its
 * own module and its specs. This repository did not notice: it lands
 * work with `forge:publish`, a script that lives here and ships
 * nowhere. Every other project got half a work model.
 *
 * @adopter-api nothing in THIS repository calls these, and that is the
 * point: the consumer is an adopting project, which has no
 * `forge:publish` of its own. `lint:core-public-consumers` would
 * otherwise read "no in-repo importer" as "published by accident",
 * which is the failure mode it exists to catch and this is not it.
 */
export {
	createIntegrationEngine,
	runIntegrationCycle,
	runLocalMergeCycle,
} from '../lib/integration-engine/index';
/** @adopter-api see the note above the engine's own block. */
export type { IIntegrationEngine } from '../lib/integration-engine/index.interface';
/** @adopter-api see the note above the engine's own block. */
export type {
	ILocalMergeCycleInput,
	ILocalMergeCycleOutcome,
	ILocalMergeCycleStatus,
} from '../lib/integration-engine/local-merge-cycle.interface';
export {
	createStartupGovernanceSeam,
	renderStartupGate,
	runStartupGate,
	startCheckoutHydration,
	startupGateWarnings,
} from '../lib/startup-gate/index';
export type { IStartupStatePorts } from '../lib/startup-reconciler/index';
// x00552: the CLI records human decisions about startup repair tasks in
// a tracked file, and reads it with the same parser the boot uses.
export {
	type IRepairDecision,
	type IRepairResolution,
	parseRepairResolutions,
	REPAIR_DECISIONS,
	REPAIR_RESOLUTIONS_PATH,
	renderRepairResolutions,
} from '../lib/startup-reconciler/index';
// The namespace maintenance pass attributes a ref with the SAME parser
// the reconciler reads it with. A second reading of the same
// template is how a pass renames work into names the reader can no
// longer attribute, so the parser is published rather than copied.
export { compileWorkRefParser } from '../lib/startup-reconciler/index';

// --- forge governance ------------------------------------------------------
// The desired-state builder is public because the committed governance
// YAML is RENDERED from it. Keeping it internal is what let a second
// derivation grow in `tools/` and disagree with this one.
export {
	buildDesiredState,
	type IDesiredBranchRule,
	type IDesiredForgeState,
	type ILiveForgeState,
} from '../lib/forge-governance/index';

export {
	callerCheckout,
	sharedCheckout,
} from '../lib/shared/shared-checkout';
export { projectBranches } from '../lib/development-policy/project-branches';
export { createStaleRuntimeWatch } from '../lib/development-policy/stale-runtime-advisory';
