/**
 * contracts/index.ts — subpath export for @delendai/core/contracts.
 *
 * r00028 (Track C / §9): a thin barrel that re-exports the
 * type-only contracts and the small shared envelope helpers — no
 * Node-only modules.
 * Plugins and external consumers that need a type (e.g. for
 * declaration files, mocks, or test fixtures) can import from
 * `@delendai/core/contracts` and stay free of the runtime
 * weight of `@delendai/core/public`.
 *
 * For other runtime values (constants, classes, functions), keep using
 * `@delendai/core/public`. The two subpaths are complementary, not a
 * replacement.
 */

export type { IGracefulShutdownOptions } from '../lib/contracts/interfaces/graceful-shutdown.interface';
export type { IDelendaiProject } from '../lib/contracts/interfaces/delendai-project.interface';
export type { ICorePaths } from '../lib/contracts/interfaces/core-paths.interface';
export type { IMcpToolSurfaceMode } from '../lib/contracts/interfaces/surface-mode.interface';
export type { IWorkspacePathProvider } from '../lib/contracts/interfaces/workspace-paths.interface';
export type { IPluginConfigExample } from '../lib/contracts/interfaces/plugin-config-example.interface';
export type { IDelendaiProjectMetadata } from '../lib/contracts/interfaces/project-metadata.interface';
export type { IStatusCollector } from '../lib/contracts/interfaces/status-collector.interface';
export type { IResolvedHostIdentity } from '../lib/contracts/interfaces/resolved-host-identity.interface';
export type { IDelendaiCliArgs } from '../lib/contracts/interfaces/cli-args.interface';
export type {
	IToolRegistration,
	IPromptRegistration,
	IResourceRegistration,
} from '../lib/contracts/interfaces/tool-registration.interface';
export type { IKnowledgeEntry } from '../lib/contracts/interfaces/knowledge.interface';
export type { ISkillEntry } from '../lib/contracts/interfaces/knowledge.interface';
export type { IActivationContribution } from '../lib/contracts/interfaces/activation-report.interface';
export type {
	IMcpPluginContext,
	IMcpPlugin,
	IMcpPluginRegistrations,
} from '../lib/plugins/plugin-contract';
export type { ICommitAuthorResolution } from '../lib/contracts/interfaces/commit-author.interface';
export type {
	WorkspacePathStatus,
	WorkspaceLayoutProbe,
	IWorkspaceLayoutArgs,
} from '../lib/contracts/interfaces/workspace-layout.interface';
export type { IFileReader } from '../lib/bootstrap/analyze-project';
export type {
	IGitRunner,
	IGitRunResult,
} from '../lib/contracts/interfaces/git-runner.interface';
export type {
	ICommitAndPushOptions,
	ICommitAndPushResult,
} from '../lib/contracts/interfaces/git-write.interface';
export type { IHostCapabilities } from '../lib/contracts/interfaces/host-capabilities.interface';
export type {
	IExternalTool,
	IToolProbeResult,
	IProbeDeps,
	IRunExternalToolInput,
	IExternalToolRun,
	IInstallHint,
	IArgvExec,
} from '../lib/contracts/interfaces/external-tool.interface';
export type { IFinding } from '../lib/contracts/interfaces/finding.interface';
export type {
	ICursorPage,
	IPaginatedItems,
	IExcerptRange,
} from '../lib/contracts/interfaces/pagination.interface';
export type {
	ICacheEvictionRule,
	ICacheEvictionRegistry,
} from '../lib/contracts/interfaces/cache-eviction.interface';
export type { ICheckpointAdvisory } from '../lib/contracts/interfaces/checkpoint-advisory.interface';
export type { IAdoptionAssessment } from '../lib/contracts/interfaces/adoption-assessment.interface';
export type {
	IBuildAdoptProjectPlanInput,
	IAdoptProjectPlan,
	IAdoptProjectToolDeps,
	IAdoptProjectPreset,
} from '../lib/contracts/interfaces/adopt-project.interface';
export type { IExistingDelendaiInstall } from '../lib/contracts/interfaces/existing-delendai-install.interface';
export type {
	IDependencyGraphPluginInput,
	IDependencyGraphMissingDependency,
	IDependencyGraphCycle,
	IDependencyGraphNode,
	IDependencyGraphSnapshot,
	IBlockDependentsResult,
	PluginDependencyLifecycleState,
	PluginDependencyFailureType,
} from '../lib/contracts/interfaces/dependency-graph.interface';
export type {
	IAgentIdentity,
	AgentHost,
} from '../lib/contracts/interfaces/agent-identity.interface';
export type {
	IAgentSlot,
	ISubagentSlot,
} from '../lib/contracts/interfaces/agent-slot.interface';
export type {
	IConfigurationOwner,
	IConfigurationArtifact,
	IConfigurationPluginCapabilities,
	IConfigurationPlugin,
	IConfigurationCenterEnvBlockedCapability,
	IConfigurationCenterEnvSummary,
	IConfigurationCenterSummary,
	IConfigurationCenterSnapshot,
	IConfigurationCenterPage,
	IConfigurationCenterResult,
	IConfigurationCenterInput,
	ConfigurationCenterSection,
	ConfigurationArtifactKind,
	ConfigurationOwnerOrigin,
} from '../lib/contracts/interfaces/configuration-center.interface';
export type {
	IMutexMetricsCollector,
	IMutexMetricsSnapshot,
} from '../lib/contracts/interfaces/mutex-metrics.interface';
export type { IDelendaiToolOutputs } from '../generated/tool-outputs';
export type {
	IPrepareContext,
	IActivateContext,
	IPhasedLifecycle,
} from '../lib/plugins/lifecycle';
// Shared envelopes (Track M / §46). Plugins adopt
// these shapes gradually so the LLM can recognise a small, stable
// set of result shapes instead of one per plugin.
export type {
	EntityRef,
	Refusal,
	EnvelopeMeta,
	OperationResult,
	OperationSuccess,
	OperationFailure,
	PagedResult,
	MutationResult,
	DiagnosticSeverity,
	DiagnosticResult,
	ResourceResult,
} from '../lib/contracts/envelopes.contract';
export {
	isOperationSuccess,
	isOperationFailure,
	success,
	failure,
} from '../lib/contracts/envelopes.contract';

/**
 * r00030 / r00029 S1+ : additional pure types promoted from runtime to the
 * type-only surface so client code can depend on them without dragging
 * `@delendai/core/public` in. Each export here must be a `type` (no
 * runtime values) — the `no-node-imports-in-contracts` lint guards the
 * `@delendai/contracts` package; this barrel stays in `@delendai/core`
 * for the canonical re-export surface.
 */
export type { IToolEffect } from '../lib/contracts/interfaces/tool-registration.interface';
export type { PluginOrigin } from '../lib/contracts/interfaces/plugin-origin.interface';
export type {
	IRuntimeEvent,
	IRuntimeEventSink,
	RuntimeEventInput,
} from '../lib/contracts/interfaces/runtime-event.interface';
