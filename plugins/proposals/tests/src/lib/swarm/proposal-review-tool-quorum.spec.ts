import { describe, expect, it } from 'vitest';

import {
	describeApprovalOutcome,
	quorumForReview,
	reviewCompletion,
	shouldAutoTransitionProposal,
} from '../../../../src/lib/swarm/proposal-review-tool-quorum';
import {
	reviewTransition,
	type IReviewState,
} from '../../../../src/lib/swarm/proposal-review';

const submitted: IReviewState = {
	status: 'in_review',
	implementer: 'alice',
	reviewer: null,
	rounds: [],
};

/** Walk the real transition so the tests never assert on a hand-built state. */
const approve = (
	state: IReviewState,
	agent: string,
	quorum: number,
): IReviewState => {
	const result = reviewTransition(state, 'approve', agent, 'looks right', {
		quorum,
	});
	if (!result.ok || result.next === undefined) {
		throw new Error(result.reason ?? 'transition produced no state');
	}
	return result.next;
};

describe('the review tool applies the quorum (f00508 S4)', () => {
	describe('an approval that closes nothing does not read like one that does', () => {
		it('says how many approvals are still missing', () => {
			const outcome = describeApprovalOutcome(
				approve(submitted, 'bob', 2),
				2,
			);

			expect(outcome.closed).toBe(false);
			expect(outcome.remaining).toBe(1);
			expect(outcome.message).toContain('NOT done');
			expect(outcome.message).toContain('1 more approval');
		});

		it('says the next reviewer has to be someone else', () => {
			const outcome = describeApprovalOutcome(
				approve(submitted, 'bob', 2),
				2,
			);

			expect(outcome.message).toContain('has not approved this round');
			expect(outcome.message).toContain('bob');
		});

		it('says the lock is kept, because it is', () => {
			expect(
				describeApprovalOutcome(approve(submitted, 'bob', 2), 2)
					.message,
			).toContain('keeps its lock');
		});

		it('closes once the quorum is complete', () => {
			const outcome = describeApprovalOutcome(
				approve(approve(submitted, 'bob', 2), 'carol', 2),
				2,
			);

			expect(outcome.closed).toBe(true);
			expect(outcome.remaining).toBe(0);
			expect(outcome.approvedBy).toEqual(['bob', 'carol']);
			expect(outcome.message).toContain('done');
		});

		it('reads exactly as today with a quorum of one', () => {
			const outcome = describeApprovalOutcome(
				approve(submitted, 'bob', 1),
				1,
			);

			expect(outcome.closed).toBe(true);
			expect(outcome.message).toBe(
				'approved; the slice is done and its lock is released',
			);
		});
	});

	describe('the same agent approving twice', () => {
		it('is refused with the reason, not a generic error', () => {
			const once = approve(submitted, 'bob', 2);
			const twice = reviewTransition(
				once,
				'approve',
				'bob',
				'still fine',
				{
					quorum: 2,
				},
			);

			expect(twice.ok).toBe(false);
			expect(twice.ok === false ? twice.reason : '').toContain(
				'already approved',
			);
			expect(twice.ok === false ? twice.reason : '').toContain(
				'DIFFERENT',
			);
		});
	});

	describe('the proposal must not close before its slice does', () => {
		it('does not auto-transition on an approval that left the slice in review', () => {
			// Written when approval and closure could not diverge; run
			// after they can, it would mark the whole proposal done while
			// the slice was still waiting for its second reviewer.
			expect(
				shouldAutoTransitionProposal(approve(submitted, 'bob', 2)),
			).toBe(false);
		});

		it('auto-transitions on the approval that did close it', () => {
			expect(
				shouldAutoTransitionProposal(
					approve(approve(submitted, 'bob', 2), 'carol', 2),
				),
			).toBe(true);
		});

		it('behaves as before when the quorum is one', () => {
			expect(
				shouldAutoTransitionProposal(approve(submitted, 'bob', 1)),
			).toBe(true);
		});
	});

	describe('close_slice reads an incomplete quorum as unfinished review', () => {
		it('refuses, and says the review is under way rather than absent', () => {
			const completion = reviewCompletion(
				approve(submitted, 'bob', 2),
				2,
			);

			expect(completion.finished).toBe(false);
			expect(completion.reason).toContain('under way but incomplete');
			expect(completion.reason).toContain('1 of 2');
		});

		it('accepts once the quorum closed the slice', () => {
			expect(
				reviewCompletion(
					approve(approve(submitted, 'bob', 2), 'carol', 2),
					2,
				).finished,
			).toBe(true);
		});

		it('distinguishes never-submitted from awaiting-a-reviewer', () => {
			expect(
				reviewCompletion(
					{
						status: 'none',
						implementer: null,
						reviewer: null,
						rounds: [],
					},
					2,
				).reason,
			).toContain('not been submitted');
			expect(reviewCompletion(submitted, 2).reason).toContain(
				'nobody has approved it yet',
			);
		});

		it('distinguishes both from changes having been requested', () => {
			const objected = reviewTransition(
				submitted,
				'request_changes',
				'bob',
				'the digest is wrong',
				{ quorum: 2 },
			);
			if (!objected.ok || objected.next === undefined) {
				throw new Error(objected.reason ?? 'no state');
			}

			expect(reviewCompletion(objected.next, 2).reason).toContain(
				'requested changes',
			);
		});
	});

	describe('a reopened round discards what was approved before it', () => {
		it('needs the full quorum again after changes were requested', () => {
			const once = approve(submitted, 'bob', 2);
			const objected = reviewTransition(
				once,
				'request_changes',
				'carol',
				'the digest is wrong',
				{ quorum: 2 },
			);
			if (!objected.ok || objected.next === undefined) {
				throw new Error(objected.reason ?? 'no state');
			}
			const resubmitted = reviewTransition(
				objected.next,
				'submit',
				'alice',
				'',
				{ quorum: 2 },
			);
			if (!resubmitted.ok || resubmitted.next === undefined) {
				throw new Error(resubmitted.reason ?? 'no state');
			}

			// bob's approval was evidence about code that has since changed.
			expect(
				describeApprovalOutcome(approve(resubmitted.next, 'bob', 2), 2)
					.remaining,
			).toBe(1);
		});
	});

	describe('the quorum the tool asks for', () => {
		it('is one when nothing is configured and no risk is known', () => {
			expect(quorumForReview(undefined)).toBe(1);
		});

		it('rises with risk', () => {
			expect(quorumForReview({}, 'high')).toBe(2);
			expect(quorumForReview({}, 'critical')).toBe(3);
		});

		it('lets configuration win in both directions', () => {
			expect(quorumForReview({ quorum: 4 }, 'low')).toBe(4);
			expect(quorumForReview({ enabled: false }, 'critical')).toBe(1);
		});
	});
});
