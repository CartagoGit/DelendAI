/**
 * reconcile-before-dispatch.ts — f00505 S2.
 *
 * The decision that sits between "this slice is claimable" and "send an
 * agent to implement it": is the work already there?
 *
 * Sending an agent to reimplement shipped work is expensive twice over. It
 * burns a whole agent-session on a no-op, and it ends with a diff that
 * either reverts something that already worked or churns it for no reason —
 * which then has to be reviewed and unpicked by someone else. This repo has
 * the receipts: x00419 sat in `pending` with all seven of its slices already
 * implemented, and f00414 the same.
 *
 * The hard part is not detecting done work. It is not withholding work that
 * has not started. Those two mistakes are not symmetric: a slice dispatched
 * unnecessarily costs one wasted session and is obvious the moment the agent
 * looks; a slice withheld wrongly is INVISIBLE — the board simply never
 * offers it, and nobody is waiting for a result they did not ask for. So the
 * rule below is deliberately lopsided: it withholds only on the strongest
 * verdict the evaluator can produce, and it dispatches in every case it is
 * not sure about, including every case it cannot judge at all.
 *
 * The bar is 0.95, which the evaluator only awards when the declared files
 * are all tracked AND both corroborations are present: tests exercising them
 * and a commit the proposal itself cites as having shipped the slice. A
 * covering spec alone is not enough, and that is not a theoretical caveat —
 * x00420 S1 declared `with-file-mutex.ts`, a file that already existed with a
 * property spec beside it, and it was real unstarted work. Nearly every
 * source file in this repo has a spec, so on that signal alone the rule would
 * have withheld a genuine slice. The cited commit is what distinguishes
 * "already implemented" from "about to modify something well tested".
 */
import type {
	ISatisfactionVerdict,
	TObservedSliceStatus,
} from '../proposals/satisfaction-evaluator';

/** The confidence at which withholding a slice is safe. See the header. */
export const WITHHOLD_CONFIDENCE_FLOOR = 0.95;

/**
 * Statuses whose slices are never reconciled. A retired or done proposal is
 * a historical record: reading its slices as candidates would be answering a
 * question nobody asked, and a `blocked` one is waiting on a decision that
 * reconciliation has no standing to make.
 */
const FROZEN_STATUSES: ReadonlySet<string> = new Set([
	'done',
	'retired',
	'blocked',
	'paused',
]);

export type TDispatchDecision =
	| 'dispatch'
	| 'withhold-already-satisfied'
	| 'dispatch-for-verification';

export interface IDispatchCandidate {
	readonly proposalId: string;
	readonly sliceId: string;
	/** The proposal's own status, not the slice's. */
	readonly proposalStatus: string;
}

export interface IReconciliationOutcome {
	readonly proposalId: string;
	readonly sliceId: string;
	readonly decision: TDispatchDecision;
	/** Why, in terms a human can check against the tree. */
	readonly reason: string;
	/** The verdict this decision rests on, when there was one. */
	readonly verdict?: ISatisfactionVerdict | undefined;
}

const describeEvidence = (verdict: ISatisfactionVerdict): string => {
	const supporting = verdict.evidence
		.filter((item) => item.supports)
		.map((item) => item.detail);
	return supporting.length === 0
		? 'no supporting evidence'
		: supporting.join('; ');
};

/**
 * Whether an agent should be sent to implement this slice.
 *
 * `verdict` is absent when the slice could not be observed at all. That is
 * not a reason to hold anything back — an unobservable slice is exactly the
 * one a human needs an agent to look at.
 */
export const reconcileBeforeDispatch = (
	candidate: IDispatchCandidate,
	verdict?: ISatisfactionVerdict,
): IReconciliationOutcome => {
	const base = {
		proposalId: candidate.proposalId,
		sliceId: candidate.sliceId,
	};

	if (FROZEN_STATUSES.has(candidate.proposalStatus)) {
		return {
			...base,
			decision: 'dispatch',
			reason: `proposal is "${candidate.proposalStatus}", which reconciliation never inspects; the dispatch decision belongs to whoever moved it there`,
		};
	}

	if (verdict === undefined) {
		return {
			...base,
			decision: 'dispatch',
			reason: 'the slice could not be observed, and an unobservable slice is precisely the one worth looking at',
		};
	}

	const observed: TObservedSliceStatus = verdict.observed;

	if (
		observed === 'likely-done' &&
		verdict.confidence >= WITHHOLD_CONFIDENCE_FLOOR
	) {
		return {
			...base,
			decision: 'withhold-already-satisfied',
			verdict,
			reason: `the code already satisfies this slice (confidence ${verdict.confidence.toString()}): ${describeEvidence(verdict)}. Mark the slice done rather than reimplementing it.`,
		};
	}

	if (observed === 'likely-done') {
		// Looks done, but on one corroboration rather than two. Withholding
		// here is the mistake that hides work, so it is dispatched — as a
		// verification, which is cheaper than an implementation and ends
		// with an agent that can say which of the two readings is right.
		return {
			...base,
			decision: 'dispatch-for-verification',
			verdict,
			reason: `the code may already satisfy this slice (confidence ${verdict.confidence.toString()}, below the ${WITHHOLD_CONFIDENCE_FLOOR.toString()} needed to withhold): ${describeEvidence(verdict)}. Verify before implementing, and cite the commit if it did ship.`,
		};
	}

	if (observed === 'verification-needed') {
		return {
			...base,
			decision: 'dispatch-for-verification',
			verdict,
			reason: `the slice's declared files are partly in place (confidence ${verdict.confidence.toString()}): ${describeEvidence(verdict)}. Check what is already there before writing anything.`,
		};
	}

	return {
		...base,
		decision: 'dispatch',
		verdict,
		reason:
			observed === 'not-started'
				? 'none of the declared files exists yet'
				: 'the slice cannot be judged from its declaration, so it is offered as ordinary work',
	};
};

/** True when the decision means "do not send an agent to implement". */
export const isWithheld = (outcome: IReconciliationOutcome): boolean =>
	outcome.decision === 'withhold-already-satisfied';
