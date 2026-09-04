/**
 * Public surface of `@delendai/proposals`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * the building blocks for hosts that wire the engines directly.
 */
export { default } from '../index';

export { registerProposalsStableTools } from '../lib/api/proposals-stable-tools';

// Stable adaptive-facade contract pins. R13 closed the `./lib/*`
// wildcard exports, so cross-plugin consumers must import these
// through the public barrel instead of deep `lib/` paths.
export {
	PROPOSALS_STABLE_TOOL_SURFACE,
	PROPOSAL_ADAPTIVE_FACADE_INTENTS,
	listProposalAdaptiveFacadePaths,
} from '../lib/api/proposals-stable-tools';
export type { IStableManifestTool } from '@delendai/core/public';
export type {
	IProposalAdaptiveFacadePath,
	TProposalAdaptiveFacadeIntent,
} from '../lib/api/proposals-stable-tools';

export {
	DEFAULT_PATH_LAYOUT,
	buildSwarmPaths,
} from '../lib/contracts/constants/default-path-layout.constant';
export type { IHostPathLayout } from '../lib/contracts/interfaces/swarm-path-layout.interface';
// f00016: proposal state-machine glossary (statuses, kinds, transitions).
// Not yet wired into the live registry/linter — see the constant's own
// doc comment on the PROPOSAL_STATE_MACHINE_V2 sequencing.
export {
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
	PROPOSAL_STATUS_TRANSITIONS,
	PROPOSAL_KINDS,
	PROPOSAL_PREFIX_BY_KIND,
	PROPOSAL_KIND_BY_PREFIX,
	KIND_TO_DONE_SUBFOLDER,
	doneFolderFor,
	PROPOSAL_SCAN_FOLDERS,
	PROPOSAL_FLAGS,
} from '../lib/contracts/constants/proposal-glossary.constant';
export type {
	IProposalStatus,
	IProposalStatusInfo,
	IProposalKind,
	IProposalKindInfo,
	IProposalFlagInfo,
} from '../lib/contracts/constants/proposal-glossary.constant';
export {
	DEFAULT_PROPOSAL_FOLDER_POLICY,
	proposalFolderFor,
	proposalFoldersForPolicy,
} from '../lib/contracts/proposal-folder-policy';
export type {
	IProposalFolderMode,
	IProposalFolderPolicy,
} from '../lib/contracts/proposal-folder-policy';
// Swarm-domain contracts (moved out of the agnostic core).
export type {
	IProposalFamily,
	IProposalStoreConfig,
} from '../lib/contracts/interfaces/proposal-store.interface';
export type {
	ICloseMarker,
	ICloseMarkerSet,
} from '../lib/contracts/interfaces/close-markers.interface';
export type {
	IModelRoute,
	IModelRoutingTable,
} from '../lib/contracts/interfaces/model-routing.interface';

export { buildAgentLockRegistration } from '../lib/tools/agent-lock.tool';
export type { IAgentLockToolOptions } from '../lib/tools/agent-lock.tool';
export { buildAgentWorktreeRegistration } from '../lib/tools/agent-worktree.tool';
export type { IAgentWorktreeToolOptions } from '../lib/tools/agent-worktree.tool';
export {
	runAgentWorktreeEngine,
	parseWorktreeList,
} from '../lib/agents/agent-worktree-engine';
export type {
	IAgentWorktreeArgs,
	IAgentWorktreeOptions,
	IAgentWorktreeResult,
	IWorktreeEntry,
} from '../lib/agents/agent-worktree-engine';
export {
	createFileMutexWorktreeCoordinator,
	createPassthroughWorktreeCoordinator,
	resolveWorktreeSyncCoordinator,
} from '../lib/agents/worktree-sync-coordinator';
export type { IWorktreeSyncCoordinator } from '../lib/agents/worktree-sync-coordinator';
export { buildTaskQueueRegistration } from '../lib/tools/task-queue.tool';
export type { ITaskQueueToolOptions } from '../lib/tools/task-queue.tool';
export { buildSyncProposalsRegistration } from '../lib/tools/sync-proposals.tool';
export type { ISyncProposalsToolOptions } from '../lib/tools/sync-proposals.tool';
export { buildGetProposalWorkflowRegistration } from '../lib/tools/get-proposal-workflow.tool';
export type { IGetProposalWorkflowToolOptions } from '../lib/tools/get-proposal-workflow.tool';
export {
	buildRoundContextRegistration,
	buildRoundContextOutput,
} from '../lib/tools/round-context.tool';
export type {
	IRoundContextToolOptions,
	IRoundContextOutput,
} from '../lib/tools/round-context.tool';
export {
	buildAgentNamesRegistration,
	runAgentNames,
} from '../lib/tools/agent-names.tool';
export type {
	IAgentNamesToolOptions,
	IAgentNamesArgs,
} from '../lib/tools/agent-names.tool';
export {
	DEFAULT_AGENT_NAME_POOL,
	pickFromPool,
} from '../lib/knowledge/agent-name-pool';
export {
	buildContinueProposalRegistration,
	runContinueProposal,
} from '../lib/tools/continue-proposal.tool';
export type {
	IContinueProposalToolOptions,
	IContinueProposalArgs,
} from '../lib/tools/continue-proposal.tool';
export {
	buildProposalTransitionRegistration,
	runProposalTransition,
} from '../lib/tools/proposal-transition.tool';
export type {
	IProposalTransitionToolOptions,
	IProposalTransitionArgs,
} from '../lib/tools/proposal-transition.tool';
export {
	buildClosePlanRegistration,
	runClosePlan,
} from '../lib/tools/close-plan.tool';
export type {
	IClosePlanArgs,
	IClosePlanToolOptions,
} from '../lib/tools/close-plan.tool';
export {
	allocateNextProposalId,
	prefixForKind,
} from '../lib/proposals/proposal-id-allocator';
export type { IProposalIdAllocatorOptions } from '../lib/proposals/proposal-id-allocator';
export {
	DEFAULT_DELEGATE_AFTER_TOOL_CALLS,
	buildAutoWorkOrchestrationPolicy,
	buildAutoWorkRegistration,
	runAutoWork,
} from '../lib/tools/auto-work.tool';
export type {
	IAutoWorkOrchestrationConfig,
	IAutoWorkOrchestrationPolicy,
	IAutoWorkPersistConfig,
	IAutoWorkToolOptions,
} from '../lib/tools/auto-work.tool';
export {
	buildPlanRegistration,
	buildDelegateRegistration,
} from '../lib/tools/orchestration.tool';
export type { IDelegateToolOptions } from '../lib/tools/orchestration.tool';
export {
	buildCreateProposalRegistration,
	buildCloseSliceRegistration,
	buildReviewRegistration,
	buildProposalBoardRegistration,
} from '../lib/tools/authoring.tool';
export type { IAuthoringToolOptions } from '../lib/tools/authoring.tool';
export { buildAdoptRegistration } from '../lib/tools/adopt.tool';
export { analyzeProposals, PROPOSALS_LAYOUT } from '../lib/proposals/adopt';
export type { IAdoptionReport, IScanEntry } from '../lib/proposals/adopt';
export { buildProposalWorkflow } from '../lib/knowledge/proposal-workflow';
export type { IProposalWorkflow } from '../lib/knowledge/proposal-workflow';
// f00114 (f00050 S-G): the prefix taxonomy as executable schema.
export {
	kindMatchesId,
	newProposalIdSchema,
	PROPOSAL_KIND_VALUES,
	proposalIdSchema,
	proposalKindSchema,
} from '../lib/contracts/schemas/proposal-kind.schema';
export type { IKindIdMatch } from '../lib/contracts/schemas/proposal-kind.schema';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
