/**
 * satisfaction-evaluator.ts — f00505 S1.
 *
 * Answers one question about a slice that still declares itself pending:
 * does the code already satisfy it?
 *
 * The question is worth asking because the answer is often yes. A slice
 * that says `pending` while its work has already landed sends the next
 * agent to reimplement it — which costs tokens, produces a conflicting
 * diff on a shared checkout, and leaves the proposal open forever
 * because nobody can honestly close what they did not do. Two live cases
 * in this repo (`f00414`, whose notes record the implementation landing
 * by concurrent commits, and `x00419`, implemented in full across seven
 * slices that all still read `pending`) are what this module exists to
 * catch before dispatch.
 *
 * The evaluator is PURE: it classifies facts someone else gathered. That
 * keeps the judgement testable without a git fixture, and keeps the
 * collection of evidence — which needs the filesystem and git — out of
 * the decision.
 *
 * The conservative rule that governs every branch: absence of evidence
 * is never evidence of completion. A slice we cannot judge comes back
 * `unknown`, and `unknown` is a normal answer, not a failure.
 */

/**
 * What the code says about a slice, as opposed to what the slice says
 * about itself.
 *
 * - `likely-done` — several independent signals agree the work landed.
 *   Still not `done`: closing a slice remains a reviewed act.
 * - `verification-needed` — something landed, but not enough to call it.
 * - `not-started` — nothing the slice declares exists yet.
 * - `unknown` — the slice cannot be judged from what was observed.
 */
export type TObservedSliceStatus =
	| 'likely-done'
	| 'verification-needed'
	| 'not-started'
	| 'unknown';

export type TEvidenceKind =
	| 'files-tracked'
	| 'files-missing'
	| 'files-unresolvable'
	| 'tests-covering'
	| 'commit-cited';

export interface ISatisfactionEvidence {
	readonly kind: TEvidenceKind;
	/** Whether this observation argues FOR the work having landed. */
	readonly supports: boolean;
	/** Human-readable, and specific enough to check by hand. */
	readonly detail: string;
}

export interface ISatisfactionVerdict {
	readonly sliceId: string;
	readonly declared: string;
	readonly observed: TObservedSliceStatus;
	/** 0..1. Never above zero without at least one supporting observation. */
	readonly confidence: number;
	readonly evidence: readonly ISatisfactionEvidence[];
}

/**
 * The facts a collector gathered about one slice. Every field is a
 * plain list so the evaluator stays free of I/O.
 */
export interface ISliceObservation {
	readonly sliceId: string;
	readonly declaredStatus: string;
	/** Declared paths that resolve to a real file tracked by git. */
	readonly trackedFiles: readonly string[];
	/** Declared paths that resolve to nothing on disk. */
	readonly missingFiles: readonly string[];
	/**
	 * Declared entries that name no single file — a glob, a placeholder,
	 * a directory. They are not counted for or against: a slice scoped
	 * as `packages/**` says nothing checkable about its own completion.
	 */
	readonly unresolvableFiles: readonly string[];
	/** Spec files that exercise the slice's tracked files. */
	readonly coveringTests: readonly string[];
	/** Commits the proposal cites as having shipped this slice. */
	readonly citedCommits: readonly string[];
}

/** Only a pending slice is worth this question. */
const PENDING = 'pending';

const buildEvidence = (
	observation: ISliceObservation,
): ISatisfactionEvidence[] => {
	const evidence: ISatisfactionEvidence[] = [];
	if (observation.trackedFiles.length > 0) {
		evidence.push({
			kind: 'files-tracked',
			supports: true,
			detail: `${observation.trackedFiles.length} declared file(s) exist and are tracked: ${observation.trackedFiles.join(', ')}`,
		});
	}
	if (observation.missingFiles.length > 0) {
		evidence.push({
			kind: 'files-missing',
			supports: false,
			detail: `${observation.missingFiles.length} declared file(s) do not exist: ${observation.missingFiles.join(', ')}`,
		});
	}
	if (observation.unresolvableFiles.length > 0) {
		evidence.push({
			kind: 'files-unresolvable',
			supports: false,
			detail: `${observation.unresolvableFiles.length} declared entr(ies) name no single file and cannot be judged: ${observation.unresolvableFiles.join(', ')}`,
		});
	}
	if (observation.coveringTests.length > 0) {
		evidence.push({
			kind: 'tests-covering',
			supports: true,
			detail: `covered by ${observation.coveringTests.join(', ')}`,
		});
	}
	if (observation.citedCommits.length > 0) {
		evidence.push({
			kind: 'commit-cited',
			supports: true,
			detail: `the proposal cites ${observation.citedCommits.join(', ')} as shipping this work`,
		});
	}
	return evidence;
};

const unjudgeable = (
	observation: ISliceObservation,
	reason: string,
): ISatisfactionVerdict => ({
	sliceId: observation.sliceId,
	declared: observation.declaredStatus,
	observed: 'unknown',
	confidence: 0,
	evidence: [
		{
			kind: 'files-unresolvable',
			supports: false,
			detail: reason,
		},
	],
});

/**
 * Classify one slice. Deterministic and monotonic: adding a supporting
 * observation never lowers the verdict, and no branch reaches
 * `likely-done` on a single signal.
 */
export const evaluateSliceSatisfaction = (
	observation: ISliceObservation,
): ISatisfactionVerdict => {
	if (observation.declaredStatus !== PENDING) {
		return unjudgeable(
			observation,
			`slice is declared "${observation.declaredStatus}", not "${PENDING}" — nothing to reconcile`,
		);
	}

	const resolvable =
		observation.trackedFiles.length + observation.missingFiles.length;
	if (resolvable === 0) {
		return unjudgeable(
			observation,
			'no declared path resolves to a checkable file, so completion cannot be observed',
		);
	}

	const evidence = buildEvidence(observation);
	if (observation.trackedFiles.length === 0) {
		return {
			sliceId: observation.sliceId,
			declared: observation.declaredStatus,
			observed: 'not-started',
			confidence: 0,
			evidence,
		};
	}

	const allTracked = observation.missingFiles.length === 0;
	// Independent corroboration: files existing is one signal, and it is
	// the weakest one — a slice legitimately declares a file it is about
	// to modify. Tests exercising them and a commit citation are what
	// turn "the file is there" into "the work is there".
	const corroboration =
		(observation.coveringTests.length > 0 ? 1 : 0) +
		(observation.citedCommits.length > 0 ? 1 : 0);

	if (allTracked && corroboration > 0) {
		return {
			sliceId: observation.sliceId,
			declared: observation.declaredStatus,
			observed: 'likely-done',
			confidence: corroboration === 2 ? 0.95 : 0.75,
			evidence,
		};
	}

	return {
		sliceId: observation.sliceId,
		declared: observation.declaredStatus,
		observed: 'verification-needed',
		confidence: allTracked ? 0.5 : 0.25,
		evidence,
	};
};

/** Slices whose declared and observed states disagree, worst first. */
export const collectDivergences = (
	observations: readonly ISliceObservation[],
): readonly ISatisfactionVerdict[] =>
	observations
		.map(evaluateSliceSatisfaction)
		.filter(
			(verdict) =>
				verdict.observed === 'likely-done' ||
				verdict.observed === 'verification-needed',
		)
		.sort((left, right) => right.confidence - left.confidence);
