/**
 * proposal-review-tool-quorum.ts — f00508 S4.
 *
 * What the review tool has to say and do differently once a quorum can
 * be larger than one.
 *
 * S1 made the transition itself quorum-aware and S3 decided what the
 * quorum should be. Neither of them is reachable: the tool still calls
 * the transition without a quorum, so the effective panel is one
 * reviewer no matter what the policy resolved. This is the slice that
 * connects them, and it is deliberately kept as pure functions the tool
 * calls rather than logic living inside the tool, because the tool
 * handler is already long and the interesting part is the reporting.
 *
 * ## An approval that closes nothing must not read like one that does
 *
 * The failure this exists to prevent is quiet. With a quorum of two, the
 * first reviewer approves, the tool answers `ok`, and both the reviewer
 * and whoever reads the board conclude the slice is finished. It is not:
 * it is still `in_review`, and if nobody notices, it stays there
 * forever. So an incomplete quorum answers with what is still missing
 * and what the next reviewer has to be — a different agent, which is the
 * entire reason a panel is worth more than a counter.
 *
 * ## The proposal must not close before its slice does
 *
 * `close_slice`'s auto-transition ran on every approval, without asking
 * whether that approval closed the slice. With a quorum of one it never
 * mattered, because approval and closure were the same event. With a
 * quorum of two the first approval would have transitioned the whole
 * proposal to done while the slice it belongs to was still awaiting a
 * second reviewer. That is the class of bug a quorum introduces — code
 * written when two things could not diverge, running after they can.
 */
import { standingApprovals, type IReviewState } from './proposal-review.js';
import {
	resolveReviewQuorum,
	type IReviewPanelOptions,
	type TRiskLevel,
} from './review-panel-policy.js';

export interface IApprovalOutcome {
	/** True only when this approval actually closed the slice. */
	readonly closed: boolean;
	/** Approvals still needed. Zero when closed. */
	readonly remaining: number;
	readonly quorum: number;
	/** Who has approved and still counts, newest last. */
	readonly approvedBy: readonly string[];
	/** Said to the caller. Never phrased as a close when it is not one. */
	readonly message: string;
}

/**
 * What to tell the caller after a transition.
 *
 * Reads the state the transition produced rather than re-deriving the
 * verdict, so the message cannot disagree with what was written.
 */
export const describeApprovalOutcome = (
	next: IReviewState,
	quorum: number,
): IApprovalOutcome => {
	const approvedBy = standingApprovals(next);
	const closed = next.status === 'done';
	const remaining = closed ? 0 : Math.max(0, quorum - approvedBy.length);

	if (closed) {
		return {
			closed,
			remaining,
			quorum,
			approvedBy,
			message:
				quorum === 1
					? 'approved; the slice is done and its lock is released'
					: `approved by ${approvedBy.length.toString()} of the ${quorum.toString()} reviewers the quorum needs; the slice is done and its lock is released`,
		};
	}

	return {
		closed,
		remaining,
		quorum,
		approvedBy,
		message: `recorded, but the slice is NOT done: ${remaining.toString()} more approval(s) needed to reach the quorum of ${quorum.toString()}. The next reviewer must be an agent that has not approved this round (so far: ${approvedBy.join(', ')}). The slice stays in review and keeps its lock.`,
	};
};

/**
 * Whether the proposal's auto-transition should run.
 *
 * The whole point is that this is a question at all. It used to be
 * implied by "the caller approved", which stopped being the same thing
 * the moment a quorum could exceed one.
 */
export const shouldAutoTransitionProposal = (next: IReviewState): boolean =>
	next.status === 'done';

/**
 * Whether the review on this slice is finished, for `close_slice`.
 *
 * An incomplete quorum is not a missing review — it is a review in
 * progress, and saying so is the difference between a caller that waits
 * and one that goes looking for a reviewer who has already been.
 */
export interface IReviewCompletion {
	readonly finished: boolean;
	readonly reason: string;
}

export const reviewCompletion = (
	state: IReviewState,
	quorum: number,
): IReviewCompletion => {
	if (state.status === 'done') {
		return { finished: true, reason: 'the review is approved' };
	}
	if (state.status === 'changes_requested') {
		return {
			finished: false,
			reason: 'a reviewer requested changes; resubmit after addressing them',
		};
	}
	if (state.status === 'none') {
		return {
			finished: false,
			reason: 'the slice has not been submitted for review',
		};
	}
	const approvedBy = standingApprovals(state);
	if (approvedBy.length === 0) {
		return {
			finished: false,
			reason: 'the slice is in review and nobody has approved it yet',
		};
	}
	return {
		finished: false,
		reason: `the review is under way but incomplete: ${approvedBy.length.toString()} of ${quorum.toString()} approvals, still needing ${(quorum - approvedBy.length).toString()} from agent(s) that have not approved this round`,
	};
};

/**
 * The quorum this slice's review runs under.
 *
 * A thin wrapper so the tool has one place to ask, and so the risk
 * signal — which comes from f00503 and may well be absent — is resolved
 * the same way everywhere rather than defaulted differently per call
 * site.
 */
export const quorumForReview = (
	options: IReviewPanelOptions | undefined,
	risk?: TRiskLevel,
): number => resolveReviewQuorum(options ?? {}, risk).quorum;
