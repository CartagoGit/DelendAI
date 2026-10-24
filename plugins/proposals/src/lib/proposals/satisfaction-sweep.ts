/**
 * satisfaction-sweep.ts — f00505 S3.
 *
 * A read-only pass over the board: which slices say one thing about
 * themselves while the tree says another.
 *
 * This is the reporting half of the reconciler. S2 decides, per slice,
 * whether to dispatch; this answers the operator's question instead —
 * "what in this board has drifted, and which of it should I look at
 * first?". The two share the evaluator, so the sweep can never disagree
 * with what dispatch would do about the same slice.
 *
 * ## It proposes, and never applies
 *
 * The one property worth defending. A sweep that transitioned slices on
 * its own would be acting on the weakest evidence in the system — a
 * verdict derived from file existence and a spec, with confidence
 * numbers this proposal is explicit about not trusting below 0.95. And
 * it would act on many slices at once, so a single systematic error in
 * the evaluator becomes a board-wide rewrite nobody asked for. Producing
 * a suggested transition, with the evidence beside it, keeps a person
 * between the heuristic and the state.
 *
 * ## Ordered by confidence, not by severity
 *
 * The reader is spending attention, and attention should go where the
 * evidence is strongest — a slice we are almost certain has shipped is
 * worth checking before one we merely suspect. Sorting by anything else
 * puts the guesses at the top.
 */
import {
	evaluateSliceSatisfaction,
	type ISatisfactionVerdict,
	type ISliceObservation,
} from './satisfaction-evaluator.js';

/** What the sweep suggests a human do about one slice. */
export type TSuggestedAction =
	| 'mark-done'
	| 'verify-then-decide'
	| 'leave-alone';

export interface ISweepFinding {
	readonly proposalId: string;
	readonly sliceId: string;
	readonly declared: string;
	readonly observed: string;
	readonly confidence: number;
	readonly suggested: TSuggestedAction;
	/** Why, in terms checkable against the tree. */
	readonly evidence: readonly string[];
}

export interface ISweepReport {
	readonly findings: readonly ISweepFinding[];
	readonly scanned: number;
	/** Always true. The sweep has no write path at all. */
	readonly readOnly: true;
	readonly summary: string;
}

/**
 * The bar at which a finding is worth proposing a close.
 *
 * Deliberately the same number `reconcile-before-dispatch` uses to
 * withhold. Two different bars would mean the board could recommend
 * closing a slice that dispatch would still hand out, and an operator
 * reading both would have no way to tell which was wrong.
 */
export const MARK_DONE_CONFIDENCE = 0.95;

const suggest = (verdict: ISatisfactionVerdict): TSuggestedAction => {
	if (
		verdict.observed === 'likely-done' &&
		verdict.confidence >= MARK_DONE_CONFIDENCE
	) {
		return 'mark-done';
	}
	if (
		verdict.observed === 'likely-done' ||
		verdict.observed === 'verification-needed'
	) {
		return 'verify-then-decide';
	}
	return 'leave-alone';
};

export interface ISweepInput {
	readonly proposalId: string;
	readonly observation: ISliceObservation;
}

/**
 * Sweep a set of observed slices.
 *
 * Takes observations rather than reading anything itself, so the whole
 * report is reproducible from its inputs and the collection strategy
 * stays the caller's business.
 */
export const sweepSatisfaction = (
	inputs: readonly ISweepInput[],
): ISweepReport => {
	// Each input is evaluated on its own so the verdict never loses
	// track of which proposal it came from. Looking the source back up by
	// slice id would attribute every finding to whichever proposal came
	// first, because a slice id is unique within one proposal and nothing
	// more — almost every proposal on the board has an S1. On a real
	// board that is wrong for most findings; on a test board where every
	// slice id happens to differ it is invisible.
	const findings: ISweepFinding[] = inputs
		.map((input) => ({
			proposalId: input.proposalId,
			verdict: evaluateSliceSatisfaction(input.observation),
		}))
		.filter(
			({ verdict }) =>
				verdict.observed === 'likely-done' ||
				verdict.observed === 'verification-needed',
		)
		.sort(
			(left, right) => right.verdict.confidence - left.verdict.confidence,
		)
		.map(({ proposalId, verdict }) => ({
			proposalId,
			sliceId: verdict.sliceId,
			declared: verdict.declared,
			observed: verdict.observed,
			confidence: verdict.confidence,
			suggested: suggest(verdict),
			evidence: verdict.evidence
				.filter((item) => item.supports)
				.map((item) => item.detail),
		}));

	const closable = findings.filter(
		(finding) => finding.suggested === 'mark-done',
	).length;

	return {
		findings,
		scanned: inputs.length,
		readOnly: true,
		summary:
			findings.length === 0
				? `${inputs.length.toString()} slice(s) scanned; nothing declared differs from what the tree shows`
				: `${findings.length.toString()} of ${inputs.length.toString()} slice(s) diverge; ${closable.toString()} carry enough evidence to propose closing, the rest need a look first. Nothing was changed.`,
	};
};
