import type { IRecordedRun } from './recorded-run.interface';
import type {
	IAuthoringToolOptions,
	IIndexedDocResolution,
} from '../../tools/authoring-options';
import type { IValidateEvidenceDeps } from '../../tools/proposal-transition.tool';
import type { IReviewRound } from '../../swarm/proposal-review';
import type { IApprovalOutcome } from '../../swarm/proposal-review-tool-quorum';
import type { IReviewAttribution } from '../../services/review-attribution';
import type { IProposalReviewEvidence } from './authoring-tool.interface';

/** What a review call decided, filled in by the round and read by the caller. */
export interface IReviewRoundOutcome {
	/** Set when the approver and the implementer, one model, were seen to be two processes. */
	anotherInstance: boolean;
	/** The run an approval cites, as the checkout's test journal recorded it. */
	citedRun: IRecordedRun | undefined;
	nextStatus: 'none' | 'in_review' | 'changes_requested' | 'done';
	nextImplementer: string | null;
	nextReviewer: string | null;
	nextRounds: readonly IReviewRound[];
	autoTransitionRequested: boolean;
	reopenRequested: boolean;
	handOverRequested: boolean;
	attribution: IReviewAttribution | undefined;
	approvalOutcome: IApprovalOutcome | undefined;
}

/** The arguments of one `proposal_review` call. */
export interface IReviewCallArgs {
	proposalId: string;
	sliceId: string;
	action: 'submit' | 'approve' | 'request_changes' | 'status' | 'attest';
	agent: string;
	note?: string | undefined;
	implementer?: string | undefined;
	evidence?: IProposalReviewEvidence | undefined;
	commitHash?: string | undefined;
}

/** Everything the write half of a review call needs from the call itself. */
export interface IReviewRoundContext {
	readonly options: IAuthoringToolOptions & {
		readonly validateEvidenceDeps?: IValidateEvidenceDeps;
	};
	readonly scoped: IAuthoringToolOptions;
	readonly entry: Extract<IIndexedDocResolution, { ok: true }>['entry'];
	readonly docPath: string;
	readonly args: IReviewCallArgs;
	readonly redactedNote: {
		readonly text: string;
		readonly redactions: number;
	};
	readonly peerReviewLogPathAbs: string;
	readonly outcome: IReviewRoundOutcome;
}
