/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools,
 * generated from each tool's Zod `outputSchema` by:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so any
 * change to a tool's `outputSchema` must be accompanied by a regenerate.
 * Action-multiplexed tools whose schema is intentionally permissive
 * surface as `Record<string, unknown>`.
 */

export interface ProposalsAgentLockOutput {
	[key: string]: unknown;
}

export interface ProposalsAgentNamesOutput {
	[key: string]: unknown;
}

export interface ProposalsAgentWorktreeOutput {
	[key: string]: unknown;
}

export interface ProposalsAutoWorkOutput {
	[key: string]: unknown;
}

export interface ProposalsCloseSliceOutput {
	ok: true;
	proposalId: string;
	sliceId: string;
	closed: boolean;
	lockReleased: boolean;
}

export interface ProposalsCompactStatusOutput {
	locks?: {
		active: number;
	};
	queue?: {
		queued: number;
		promoted: number;
		waiterOrphans: number;
		threshold: string;
	};
	proposals?: {
		total: number;
		actionable: number;
		byStatus: Record<string, number>;
	};
}

export interface ProposalsContinueProposalOutput {
	[key: string]: unknown;
}

export interface ProposalsCreateProposalOutput {
	ok: true;
	file: string;
	path: string;
	disjointnessIssues: {
		first: string;
		second: string;
		file: string;
	}[];
	indexCount: number;
}

export interface ProposalsDelegateOutput {
	[key: string]: unknown;
}

export interface ProposalsGetProposalWorkflowOutput {
	families: {
		prefix: string;
		description: string;
		cascadePriority: number;
	}[];
	locations: Record<string, string>;
	naming: string;
	rules: string[];
	template: string;
}

export interface ProposalsPlanOutput {
	plan: unknown;
	disjointnessIssues: unknown[];
	claimableSliceIds: string[];
}

export interface ProposalsProposalAdoptOutput {
	ok: true;
	root: string;
	layout: Record<string, unknown>;
	scan: {
		proposals: Array<{
			file: string;
			id: string;
			kind: "proposal" | "fix";
			status: string;
		}>;
		folders: string[];
		hasIndex: boolean;
		hasReadme: boolean;
		unrecognized: string[];
		other: string[];
	};
	plan: string[];
	ready: boolean;
}

export interface ProposalsProposalBoardOutput {
	proposals: Array<{
		id: string;
		status: string;
		slices: Array<{
			sliceId: string;
			status: string;
			owner: string | null;
		}>;
		claimableSliceIds?: string[];
	}>;
}

export interface ProposalsProposalReviewOutput {
	ok: true;
	proposalId: string;
	sliceId: string;
	action: string;
	status: "none" | "in_review" | "changes_requested" | "done";
	implementer: string | null;
	reviewer: string | null;
	rounds: Array<{
		verdict: "requested_changes" | "approved";
		agent: string;
		note: string;
	}>;
	lockReleased: boolean;
}

export interface ProposalsProposalTransitionOutput {
	[key: string]: unknown;
}

export interface ProposalsRoundContextOutput {
	[key: string]: unknown;
}

export interface ProposalsStateHealthOutput {
	locks: {
		active: number;
	};
	queue: {
		queueLength: number;
		queuedCount: number;
		waiterOrphans: number;
		oldestAgeMinutes: number;
		threshold: string;
	} | null;
	registry: {
		orphans: number;
		threshold: string;
	};
	healthy: boolean;
}

export interface ProposalsStateRepairOutput {
	[key: string]: unknown;
}

export interface ProposalsSyncProposalsOutput {
	changed: boolean;
	count: number;
	indexPath: string;
	errors: string[];
}

export interface ProposalsTaskQueueOutput {
	[key: string]: unknown;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface ProposalsToolOutputs {
	"proposals_agent_lock": ProposalsAgentLockOutput;
	"proposals_agent_names": ProposalsAgentNamesOutput;
	"proposals_agent_worktree": ProposalsAgentWorktreeOutput;
	"proposals_auto_work": ProposalsAutoWorkOutput;
	"proposals_close_slice": ProposalsCloseSliceOutput;
	"proposals_compact_status": ProposalsCompactStatusOutput;
	"proposals_continue_proposal": ProposalsContinueProposalOutput;
	"proposals_create_proposal": ProposalsCreateProposalOutput;
	"proposals_delegate": ProposalsDelegateOutput;
	"proposals_get_proposal_workflow": ProposalsGetProposalWorkflowOutput;
	"proposals_plan": ProposalsPlanOutput;
	"proposals_proposal_adopt": ProposalsProposalAdoptOutput;
	"proposals_proposal_board": ProposalsProposalBoardOutput;
	"proposals_proposal_review": ProposalsProposalReviewOutput;
	"proposals_proposal_transition": ProposalsProposalTransitionOutput;
	"proposals_round_context": ProposalsRoundContextOutput;
	"proposals_state_health": ProposalsStateHealthOutput;
	"proposals_state_repair": ProposalsStateRepairOutput;
	"proposals_sync_proposals": ProposalsSyncProposalsOutput;
	"proposals_task_queue": ProposalsTaskQueueOutput;
}
