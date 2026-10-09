import { journalWorkEvent } from '@delendai/core/public';

/** The work item a whole-proposal event belongs to. */
const WHOLE_PROPOSAL_ITEM = 'all';

/**
 * Tell the work telemetry journal that a proposal changed status. The
 * journal swallows its own failures, so recording never fails the move.
 */
export const journalProposalTransition = async (
	workspaceRoot: string,
	proposalId: string,
	from: string,
	to: string,
	agent: string | undefined,
): Promise<void> => {
	await journalWorkEvent(workspaceRoot, {
		kind: 'proposal_transition',
		proposal: proposalId,
		slice: WHOLE_PROPOSAL_ITEM,
		actor: agent ?? null,
		detail: { from, to },
	});
};

/** Tell the journal that an implementer handed a slice in for review. */
export const journalReviewSubmission = async (
	workspaceRoot: string,
	proposalId: string,
	sliceId: string,
	agent: string | undefined,
): Promise<void> => {
	await journalWorkEvent(workspaceRoot, {
		kind: 'slice_submitted',
		proposal: proposalId,
		slice: sliceId,
		actor: agent ?? null,
		detail: { via: 'review' },
	});
};
