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
	parseConfigFile,
	pluginConfigFor,
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
	ILoopDetectorConfig,
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
export { resolveWorkspaceContained } from '../lib/shared/contain-path';
export type { IContainedPath } from '../lib/shared/contain-path';
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
export { buildKnowledgeToolRegistration } from '../lib/tools/knowledge-tool';
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

// --- versioned skill bundles (f00029 S4: skills/manifest.json loader) ------
export { loadSkills } from '../lib/skills/load-skills';
export type { ISkillBundle } from '../lib/skills/load-skills';

// --- cross-project setup engine (f00030 S2) -------------------------------
export { buildGithubSetupSteps } from '../lib/setup/setup-steps';
export type {
	GithubAuthTier,
	IGithubSetupContext,
	ISetupStep,
} from '../lib/setup/setup-steps';
export { renderCrossProjectGuide } from '../lib/setup/cross-project-guide';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
