import { describe, expect, it } from 'vitest';

import {
	EMPTY_REVIEW,
	type IReviewState,
	parseReviewState,
	renderReviewLines,
	reviewTransition,
	standingApprovals,
} from '../../../../src/lib/swarm/proposal-review';

/** Apply a sequence of actions, failing loudly on the first refusal. */
const run = (
	start: IReviewState,
	steps: readonly {
		action: 'submit' | 'approve' | 'request_changes';
		agent: string;
		note?: string;
		quorum?: number;
	}[],
): IReviewState => {
	let state = start;
	for (const step of steps) {
		const result = reviewTransition(
			state,
			step.action,
			step.agent,
			step.note ?? '',
			{ quorum: step.quorum },
		);
		if (!result.ok || result.next === undefined) {
			throw new Error(
				`${step.action} by ${step.agent} was refused: ${result.reason ?? 'no reason'}`,
			);
		}
		state = result.next;
	}
	return state;
};

const submitted = (implementer = 'impl'): IReviewState =>
	run(EMPTY_REVIEW, [{ action: 'submit', agent: implementer }]);

describe('review panel (f00508 S1)', () => {
	describe('a quorum of one is the contract that already existed', () => {
		it('closes on a single approval', () => {
			const state = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 1 },
			]);

			expect(state.status).toBe('done');
			expect(state.reviewer).toBe('rev-a');
		});

		it('behaves identically whether the quorum is omitted or set to 1', () => {
			const omitted = reviewTransition(submitted(), 'approve', 'rev-a');
			const explicit = reviewTransition(
				submitted(),
				'approve',
				'rev-a',
				'',
				{ quorum: 1 },
			);

			expect(omitted.next).toEqual(explicit.next);
		});
	});

	describe('a quorum holds the slice open until the panel agrees', () => {
		it('a first approval does not close the slice', () => {
			const state = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 2 },
			]);

			// It must not read as a close: the board should keep showing
			// this slice as awaiting review, because it is.
			expect(state.status).toBe('in_review');
			expect(standingApprovals(state)).toEqual(['rev-a']);
		});

		it('the approval that completes the quorum closes it', () => {
			const state = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 2 },
				{ action: 'approve', agent: 'rev-b', quorum: 2 },
			]);

			expect(state.status).toBe('done');
			expect(standingApprovals(state)).toEqual(['rev-a', 'rev-b']);
		});

		it('needs three distinct reviewers for a quorum of three', () => {
			const two = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 3 },
				{ action: 'approve', agent: 'rev-b', quorum: 3 },
			]);
			expect(two.status).toBe('in_review');

			const three = run(two, [
				{ action: 'approve', agent: 'rev-c', quorum: 3 },
			]);
			expect(three.status).toBe('done');
		});

		it('refuses the same agent approving twice, and says who is still needed', () => {
			const state = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 3 },
				{ action: 'approve', agent: 'rev-b', quorum: 3 },
			]);

			const again = reviewTransition(state, 'approve', 'rev-a', '', {
				quorum: 3,
			});

			expect(again.ok).toBe(false);
			expect(again.reason).toContain('already approved this round');
			expect(again.reason).toContain('DIFFERENT');
		});
	});

	describe('unanimity: one objection blocks, it is never outvoted', () => {
		it('a single request_changes blocks a slice two reviewers had approved', () => {
			// The whole point of the panel. Under majority voting this
			// slice would close 2-1 and the reviewer who found the fault
			// would be the one overruled.
			const state = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 3 },
				{ action: 'approve', agent: 'rev-b', quorum: 3 },
				{
					action: 'request_changes',
					agent: 'rev-c',
					note: 'the persistence acceptance is not met',
					quorum: 3,
				},
			]);

			expect(state.status).toBe('changes_requested');
			expect(standingApprovals(state)).toEqual([]);
		});

		it('does not wait for the rest of the panel before blocking', () => {
			const state = run(submitted(), [
				{
					action: 'request_changes',
					agent: 'rev-a',
					note: 'wrong contract',
					quorum: 4,
				},
			]);

			expect(state.status).toBe('changes_requested');
		});

		it('keeps both positions in the log rather than resolving them', () => {
			const state = run(submitted(), [
				{
					action: 'approve',
					agent: 'rev-a',
					note: 'looks right',
					quorum: 2,
				},
				{
					action: 'request_changes',
					agent: 'rev-b',
					note: 'acceptance 3 is not met',
					quorum: 2,
				},
			]);

			expect(state.rounds.map((round) => round.verdict)).toEqual([
				'approved',
				'requested_changes',
			]);
			expect(state.rounds[1]?.note).toContain('acceptance 3');
		});
	});

	describe('an approval is evidence about one state of the code', () => {
		it('reworking the slice drops the approvals standing before it', () => {
			const blocked = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 3 },
				{
					action: 'request_changes',
					agent: 'rev-b',
					note: 'fix it',
					quorum: 3,
				},
			]);

			expect(standingApprovals(blocked)).toEqual([]);
		});

		it('resubmitting reworked code also voids them, and says so in the log', () => {
			const partial = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 3 },
			]);

			const resubmitted = run(partial, [
				{ action: 'submit', agent: 'impl', quorum: 3 },
			]);

			expect(standingApprovals(resubmitted)).toEqual([]);
			const last = resubmitted.rounds.at(-1);
			expect(last?.verdict).toBe('resubmitted');
			expect(last?.note).toContain('rev-a');
			expect(last?.note).toContain('void');
		});

		it('a first submit records no void, because there is nothing to void', () => {
			expect(submitted().rounds).toEqual([]);
		});

		it('a resubmit does not mask the previous reviewer from the chain rule', () => {
			// x00056: the agent who objected must not review their own fix.
			// The implementer's resubmit entry sits between them in the
			// log, and must not be mistaken for a fresh pair of eyes.
			const reworked = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 2 },
				{
					action: 'request_changes',
					agent: 'rev-b',
					note: 'fix it',
					quorum: 2,
				},
				{ action: 'submit', agent: 'impl', quorum: 2 },
			]);

			const selfCheck = reviewTransition(
				reworked,
				'approve',
				'rev-b',
				'',
				{ quorum: 2 },
			);

			expect(selfCheck.ok).toBe(false);
			expect(selfCheck.reason).toContain('previous reviewer');
		});
	});

	describe('the panel needs no new serialized state', () => {
		it('survives a render and re-parse of the slice lines', () => {
			const state = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', note: 'ok', quorum: 3 },
				{
					action: 'approve',
					agent: 'rev-b',
					note: 'ok too',
					quorum: 3,
				},
			]);

			const reparsed = parseReviewState(
				renderReviewLines(state).join('\n'),
			);

			expect(standingApprovals(reparsed)).toEqual(['rev-a', 'rev-b']);
			expect(reparsed.status).toBe('in_review');
		});

		it('reads a document written before the panel existed', () => {
			const legacy = [
				'- review-state: done',
				'- review-implementer: impl',
				'- review-reviewer: rev-a',
				'- review-log: approved by rev-a — verified',
			].join('\n');

			const state = parseReviewState(legacy);

			expect(state.status).toBe('done');
			expect(standingApprovals(state)).toEqual(['rev-a']);
		});

		it('round-trips a resubmit entry', () => {
			const state = run(submitted(), [
				{ action: 'approve', agent: 'rev-a', quorum: 2 },
				{ action: 'submit', agent: 'impl', quorum: 2 },
			]);

			const reparsed = parseReviewState(
				renderReviewLines(state).join('\n'),
			);

			expect(reparsed.rounds.at(-1)?.verdict).toBe('resubmitted');
			expect(standingApprovals(reparsed)).toEqual([]);
		});
	});

	describe('the rules the panel does not replace', () => {
		it('still refuses the implementer as a reviewer', () => {
			const result = reviewTransition(
				submitted(),
				'approve',
				'impl',
				'',
				{
					quorum: 3,
				},
			);

			expect(result.ok).toBe(false);
			expect(result.reason).toContain(
				'different agent than the implementer',
			);
		});

		it('still requires a note on request_changes', () => {
			const result = reviewTransition(
				submitted(),
				'request_changes',
				'rev-a',
				'   ',
				{ quorum: 2 },
			);

			expect(result.ok).toBe(false);
			expect(result.reason).toContain('note');
		});
	});
});
