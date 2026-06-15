/**
 * Public surface of `@cartago-git/mcp-proposals`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * the building blocks for hosts that wire the engines directly.
 */
export { default } from '../index';

export {
	DEFAULT_PATH_LAYOUT,
	buildSwarmPaths,
} from '../lib/contracts/constants/default-path-layout.constant';
export type { IHostPathLayout } from '../lib/contracts/interfaces/swarm-path-layout.interface';
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
	buildAutoWorkRegistration,
	runAutoWork,
} from '../lib/tools/auto-work.tool';
export type { IAutoWorkToolOptions } from '../lib/tools/auto-work.tool';
export {
	buildPlanRegistration,
	buildDelegateRegistration,
} from '../lib/tools/orchestration.tool';
export type { IDelegateToolOptions } from '../lib/tools/orchestration.tool';
export {
	buildCreateProposalRegistration,
	buildCloseSliceRegistration,
	buildProposalBoardRegistration,
} from '../lib/tools/authoring.tool';
export type { IAuthoringToolOptions } from '../lib/tools/authoring.tool';
export {
	buildProposalWorkflow,
} from '../lib/knowledge/proposal-workflow';
export type { IProposalWorkflow } from '../lib/knowledge/proposal-workflow';
