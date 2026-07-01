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
export {
	assembleCliConfig,
	runCli,
	runDoctor,
} from '../lib/cli/assemble';
export type {
	IAssembledCliConfig,
	IAssembleCliDeps,
	IDoctorReport,
} from '../lib/cli/assemble';
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
export type {
	IScaffoldAgentSlot,
	IScaffoldClientOptions,
	IScaffoldHostOptions,
	IScaffoldPluginOptions,
	IScaffoldedFile,
} from '../lib/scaffold/scaffold-host';
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
export { runCommand } from '../lib/shared/run-command';
export type {
	IRunCommandOptions,
	IRunCommandOutcome,
} from '../lib/shared/run-command';
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

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
