#!/usr/bin/env node
import { runCli } from './lib/cli/run-cli';

/**
 * Backward-compatible MCP server entrypoint.
 *
 * The human-facing `delendai` / `delendai` binaries live in
 * `@delendai/cli`; this file stays available for hosts that still
 * start the core MCP server entry directly.
 */
export { assembleCliConfig } from './lib/cli/assemble';
export { runCli } from './lib/cli/run-cli';
export {
	detectIsWsl,
	formatInstallReport,
	parseInitArgs,
} from './lib/cli/run-init';
export type { IAssembleCliDeps, IAssembledCliConfig } from './lib/cli/assemble';

// A git hook asks the project's development policy whether a commit, a
// branch creation or a push may proceed (`delendai guard <hook>`).
export { judgeGitOperation } from './lib/development-policy/git-guard';
// What a refusal says next: how work starts and lands in this profile.
export { briefWorkModel } from './lib/development-policy/declare-workflow';
export {
	DEFAULT_WORK_KIND,
	REVIEW_BATCH_ID,
	WORK_KINDS,
} from './lib/development-policy/profiles.constant';
export {
	isWorkKind,
	isHostApplicationId,
	kindsInAgentId,
	legacyWorkKind,
} from './lib/development-policy/work-ref-placeholders';
export {
	agentEnvironmentMarker,
	isAgentEnvironmentVariable,
} from './lib/work-identity/agent-environment.helper';
export { gitActorMarker } from './lib/work-identity/git-actor.helper';
export {
	AGENT_ENVIRONMENT_MARKERS,
	DELENDAI_SESSION_VARIABLE,
} from './lib/contracts/constants/agent-environment.constant';
export { readUnitRefFacts } from './lib/work-units/unit-ref-facts.service';
export { touchUnitOfCheckout } from './lib/work-units/unit-lease.service';
// The verdict on every unit of work and the reaper, for the repo's own
// reclaim scripts.
export {
	isUnitHolding,
	readUnitStandings,
	unitVerdictOf,
} from './lib/work-units/unit-standings.service';
export { readLeaseOf } from './lib/work-units/unit-lease.service';
export { reapDeliveredUnits } from './lib/work-units/unit-reaper.service';
export { compileWorkRefParser } from './lib/startup-reconciler/work-ref-identity';
export type { IUnitStandingEntry } from './lib/work-units/unit-lease.interface';
export type {
	IGitGuardVerdict,
	IGuardedGitOperation,
	IUnitRefFacts,
} from './lib/contracts/interfaces/git-guard.interface';

// The block `delendai guard install` adds to a project's git hooks.
export {
	planGuardHook,
	removeGuardBlock,
	renderGuardBlock,
} from './lib/guard-hooks/guard-hook-block.helper';
export {
	GUARD_BLOCK_BEGIN,
	GUARD_BLOCK_END,
	GUARD_CREATED_FILE,
} from './lib/contracts/constants/guard-hooks.constant';
export type {
	IGuardHookEdit,
	IGuardHookName,
	IGuardInvocation,
} from './lib/contracts/interfaces/guard-hooks.interface';

// A unit of work, one engine for the CLI's `work` command and the MCP
// `work` tool: entering, checkpointing, claiming and publishing it, and
// the policy it reads.
export { serveRefusal } from './lib/cli/refused-server';
export { adoptionFor } from './lib/workspace-migration/migrators/development-policy.migrator';
export { gatherAdoptionEvidence } from './lib/workspace-migration/migrators/development-policy-evidence';
export type {
	IAdoptedBlock,
	IAdoption,
} from './lib/workspace-migration/migrators/development-policy-adoption.interface';
export { runWorkUnit } from './lib/work-units/work-unit.service';
export { EXIT_CODE } from './lib/contracts/constants/exit-code.constant';
export type { IExitCode } from './lib/contracts/interfaces/exit-code.interface';
export type {
	IWorkUnitContext,
	IWorkUnitResult,
} from './lib/contracts/interfaces/work-unit-context.interface';
export {
	configPathFor,
	isRecord,
	readConfigText,
	scalarArg,
} from './lib/work-units/command-args.helper';
export { adoptionReportLines } from './lib/workspace-migration/migration-report.service';
export {
	readWorkspaceDocsDir,
	readWorkspacePolicy,
} from './lib/work-units/development-policy.service';
export { openPublicationPullRequest } from './lib/work-units/publication-pull-request.service';
// The gates a project declares: what `delendai validate` runs, and what
// certifies a unit before the merge model lands it.
export {
	packageManagerFrom,
	validationGateSteps,
} from './lib/work-units/validation-gate-steps.service';
export type { IValidationGateStep } from './lib/contracts/interfaces/local-certification.interface';
export {
	checkWorkflowInvariants,
	renderInvariantReport,
} from './lib/work-units/workflow-invariants.service';
export {
	policyOf,
	runWorkflowDoctor,
	sharedCheckoutOf,
} from './lib/work-units/workflow-doctor.service';
export type {
	IInvariantReport,
	IInvariantResult,
	IInvariantScope,
} from './lib/contracts/interfaces/workflow-invariants.interface';
export { worktreeAgent } from './lib/work-units/worktree-agent.service';

// What only the host and the verification scripts read: the watch that tells
// a running server its source moved, and the code a refused shared-checkout
// write carries.
export { createStaleRuntimeWatch } from './lib/development-policy/stale-runtime-advisory';
// Whether a project has a release branch of its own, and the branches its
// policy protects: read by the forge governance and release scripts.
export {
	hasSeparateReleaseBranch,
	protectedBranchNames,
} from './lib/development-policy/release-branch';
export { resolveReleaseTarget } from './lib/development-policy/release-target';
// The host keeps the shared checkout on develop while it runs.
export { startCheckoutHydration } from './lib/startup-gate/index';
export { SHARED_CHECKOUT_WRITE_REFUSED } from './lib/contracts/constants/write-refusal.constant';

// Read only by the CLI, the host and the repository scripts, so they live
// here and not on the public surface plugins build against (r00040).
export { gracefulShutdown } from './lib/cli/graceful-shutdown';
export { DEFAULT_CORE_PATHS } from './lib/contracts/interfaces/core-paths.interface';
export type {
	IMcpToolSurfaceMode,
	IPluginConfigExample,
	IToolEffect,
	IMcpPlugin,
	IScaffoldedFile,
} from './contracts';
export type { IHostCapabilityProfile } from './lib/contracts/interfaces/host-capabilities.interface';
export { buildHostAdapterPack } from './lib/hosts/host-adapter-pack';
export type { IHostAdapterPack } from './lib/hosts/host-adapter-pack';
export { deriveSourceRoots } from './lib/bootstrap/derive-config';
export { mergeDerivedConfig } from './lib/bootstrap/merge-derived-config';
export {
	REPOSITORY_NAME,
	REPOSITORY_OWNER,
	REPOSITORY_URL,
} from './lib/contracts/constants/repository-identity.constant';
export { managedPluginEnvironmentRequirements } from './lib/plugins/managed-plugin-environment';
export { diagnoseConfigFile } from './lib/plugins/load-config-file';
export {
	PACK_DEFAULTS_OVERLAY,
	PACK_IDS,
} from './lib/plugins/pack-defaults-overlay';
export { hasExplicitPluginSurfaceSelection } from './lib/plugins/parse-cli-args';
export { resolvePluginOptions } from './lib/plugins/plugin-defaults';
export { PRESET_KIND } from './lib/plugins/preset-catalog';
export {
	renderStartupReportAnsi,
	renderStartupReportPlain,
	shouldUseAnsiColors,
} from './lib/startup-report';
export type {
	IPluginWiringFs,
	IPluginWiringReport,
} from './lib/contracts/interfaces/plugin-wiring.interface';
export { diagnosePluginWiring } from './lib/scaffold/diagnose-plugin-wiring';
export { runCreatePlugin } from './lib/scaffold/create-plugin.tool';
export { scaffoldExtensionHostFiles } from './lib/scaffold/scaffold-extension-host';
export {
	scaffoldClientFiles,
	scaffoldHostProject,
	scaffoldPromptFile,
	scaffoldToolFile,
} from './lib/scaffold/scaffold-host';
export type { IScaffoldPluginOptions } from './lib/scaffold/scaffold-host';
export { createCacheEvictionRegistry } from './lib/cache/eviction-registry';
export { safePathExists } from './lib/shared/safe-list-dir';
export { HIGH_CONFIDENCE_SECRET_PATTERNS } from './lib/shared/redact';
export { targetById } from './lib/install/ide-targets';
export type {
	IInstallOptions,
	IInstallReport,
	IRunnerVia,
} from './lib/install/installer';
export { CAPABILITIES } from './lib/capabilities/schema';
export type { Capability } from './lib/capabilities/schema';
export type {
	IGovernedToolsListBudget,
	ITokenBudgetRegistry,
	ITokenBudgetSurface,
} from './lib/contracts/constants/token-budgets.constant';
export { buildValueLookup } from './lib/budgets/manifest';
export { aggregateROI } from './lib/budgets/roi';
export type { IRoiMeasurement } from './lib/budgets/roi';
export { buildCatalog } from './lib/catalog/agent-discovery-catalog';
export { ACTIONABLE_PROPOSAL_STATUSES } from './lib/catalog/agent-discovery-types';
export type { ICatalogSources } from './lib/catalog/agent-discovery-types';
export { createPluginMetrics } from './lib/observability/plugin-metrics';
export { analyzeProject } from './lib/bootstrap/index';
export type { IProjectAnalysis } from './lib/bootstrap/index';
export { SKILL_MANIFEST_REL } from './lib/skills/skill-paths';
export type { IPluginRegistryEntry } from './lib/contracts/interfaces/plugin-registry.interface';
export type { IAuthorityDeclaration } from './lib/contracts/interfaces/authority.interface';
export {
	applyJsoncEdits,
	parseJsonc,
} from './lib/config/jsonc-document';
export type { IJsoncEdit } from './lib/config/jsonc-document';
export { renderPluginConfigComment } from './lib/plugins/plugin-config-docs';
export {
	parseAuthorityDeclarations,
	parsePluginManifest,
} from './lib/manifest/define-plugin-manifest';
export {
	discoverPluginManifests,
	loadAllPluginManifests,
} from './lib/manifest/discovery';
export { validatePluginManifest } from './lib/manifest/validation';
export {
	buildPluginAddRecipe,
	type IPluginAddRecipe,
} from './lib/registry/plugin-add';
export { resolvePlugins } from './lib/registry/resolve';
export {
	STABLE_API_TOOL_NAMES,
	STABLE_API_TOOLS,
} from './lib/api/stable-facade';
export {
	buildStableManifest,
	STABLE_MANIFEST_REL,
} from './lib/api/stable-manifest';
export {
	buildRegistrySkeleton,
	detectCatchSwallow,
	detectDipViolations,
	detectLongChains,
	detectMagicNumbers,
	formatFixProposal,
	shingleBlocks,
	toRelPosix,
	walkTsFiles,
} from './lib/scan';
export {
	DEFAULT_MIGRATIONS,
	createFileSystemJournal,
} from './lib/workspace-migration/migration-registry';
export {
	runPendingMigrations,
	ensureWorkspaceMigrated,
} from './lib/workspace-migration/legacy-migration.service';
export {
	listCacheLayoutMigrations,
	readCacheLayoutStatus,
	runCacheLayoutStep,
} from './lib/workspace-migration/cache-layout-step.service';
export type { IMigrationRunResult } from './lib/contracts/interfaces/workspace-migration.interface';
export { readLatestManifestFromDisk } from './lib/workspace-migration/transaction/migration-manifest';
export type { IStoredMigrationManifest } from './lib/workspace-migration/transaction/migration-manifest';
export type { ITransactionOutcome } from './lib/workspace-migration/transaction/migration-transaction';
export {
	createDefaultPhases,
	runMigrationTransaction,
	rollbackLatestMigration,
} from './lib/workspace-migration/transaction/migration-transaction';
export { scanLegacyIdentity } from './lib/workspace-migration/scanner/legacy-identity-scanner';
export { validateDevelopmentPolicy } from './lib/development-policy/validate';
export {
	createStartupGovernanceSeam,
	renderStartupGate,
	runStartupGate,
	startupGateWarnings,
} from './lib/startup-gate/index';
export type {
	IForgeCheckRun,
	IForgePullRequest,
	IForgeRead,
	IStartupForgeSeam,
} from './lib/startup-reconciler/index';
export {
	type IRepairDecision,
	type IRepairResolution,
	parseRepairResolutions,
	REPAIR_DECISIONS,
	REPAIR_RESOLUTIONS_PATH,
	renderRepairResolutions,
} from './lib/startup-reconciler/index';
export {
	buildDesiredState,
	type IDesiredBranchRule,
} from './lib/forge-governance/index';

if (import.meta.main) {
	void runCli(process.argv.slice(2), process.cwd());
}
export {
	applyGlobalConfig,
	createFileSystemHostConfigIO,
	defaultHostConfigs,
	planGlobalConfig,
} from './lib/workspace-migration/host-scope/global-config.migrator';

export { CALL_WRITES_NOT_COMMITTED } from './lib/contracts/constants/call-writes.constant';
export { startServerLogIn } from './lib/shared/server-log';
