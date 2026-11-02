/**
 * progress-evidence.ts — f00504 S1.
 *
 * A shared answer to "has anything actually moved?".
 *
 * Two loop detectors already exist in this repo and both work: one
 * fingerprints tool and arguments with a result-aware window, the other
 * watches for exhausted budgets and repeated output per rotation slot.
 * What neither can do is say whether the TASK is advancing, because
 * neither has a notion of progress — only of repetition.
 *
 * That distinction is the whole slice. An agent may legitimately call the
 * same tool many times in a row: re-reading a file it is editing, running
 * the same spec after each fix. Judging by the tool alone flags those,
 * and a watchdog that cries wolf on honest work gets ignored, which is
 * worse than no watchdog. What separates working from stuck is whether
 * the state evolves.
 *
 * ## Waiting is not stalling
 *
 * The case that matters most in a swarm, and the easiest to get wrong. An
 * agent blocked on someone else's file lock is producing no evidence at
 * all — no new information, no state change, no files touched — and looks
 * exactly like an agent going in circles. But it is behaving correctly,
 * and escalating it is actively harmful: rotating or restarting it throws
 * away a queue position and puts a second agent behind the same lock.
 * Legitimate waiting is therefore its own state, and it never escalates.
 */

/** What one operation actually produced. */
export interface IProgressEvidence {
	/** The agent learned something it did not know. */
	readonly newInformation: boolean;
	/** Something in the world changed as a result. */
	readonly stateChanged: boolean;
	/** Files written or deleted by this operation. */
	readonly filesTouched: readonly string[];
	/** Acceptance criteria newly satisfied by this operation. */
	readonly acceptanceAdvanced: number;
	/** The blocker changed: acquired, released, or a different one. */
	readonly blockerChanged: boolean;
	/**
	 * The agent is waiting on something outside its control — another
	 * agent's lock, a queued notification, a running validation.
	 */
	readonly waitingOn?: string | undefined;
}

export const NO_EVIDENCE: IProgressEvidence = {
	newInformation: false,
	stateChanged: false,
	filesTouched: [],
	acceptanceAdvanced: 0,
	blockerChanged: false,
};

/**
 * The seven states a task can be in. Ordered from healthiest to worst so
 * a caller can compare severity without a lookup table.
 */
export type TProgressState =
	| 'advancing'
	| 'exploring'
	| 'waiting'
	| 'retrying'
	| 'churning'
	| 'stalled'
	| 'blocked';

const SEVERITY: readonly TProgressState[] = [
	'advancing',
	'exploring',
	'waiting',
	'retrying',
	'churning',
	'stalled',
	'blocked',
];

export const progressSeverity = (state: TProgressState): number =>
	SEVERITY.indexOf(state);

/** What the caller knows about the run so far. */
export interface IProgressHistory {
	/** Evidence from each operation, oldest first. */
	readonly operations: readonly IProgressEvidence[];
	/** Operations without any evidence before this is a stall. */
	readonly barrenLimit: number;
	/** The task cannot proceed at all and said why. */
	readonly declaredBlocker?: string | undefined;
}

export const hasAnyEvidence = (evidence: IProgressEvidence): boolean =>
	evidence.newInformation ||
	evidence.stateChanged ||
	evidence.filesTouched.length > 0 ||
	evidence.acceptanceAdvanced > 0 ||
	evidence.blockerChanged;

/** Consecutive operations at the end of the run that produced nothing. */
export const barrenStreak = (
	operations: readonly IProgressEvidence[],
): number => {
	let streak = 0;
	for (let index = operations.length - 1; index >= 0; index -= 1) {
		const operation = operations[index];
		if (operation === undefined) break;
		// A wait is not barren. The agent is doing the right thing and
		// producing nothing is what that correctly looks like.
		if (operation.waitingOn !== undefined) break;
		if (hasAnyEvidence(operation)) break;
		streak += 1;
	}
	return streak;
};

export interface IProgressVerdict {
	readonly state: TProgressState;
	/** Whether the recovery ladder should be climbed. */
	readonly shouldEscalate: boolean;
	readonly reason: string;
	readonly barrenOperations: number;
}

/**
 * Derive the state from the evidence. Pure and total: every history maps
 * to exactly one state, so two components asking the same question get
 * the same answer.
 */
export const deriveProgressState = (
	history: IProgressHistory,
): IProgressVerdict => {
	const last = history.operations.at(-1);
	const barren = barrenStreak(history.operations);

	if (history.declaredBlocker !== undefined) {
		return {
			state: 'blocked',
			shouldEscalate: true,
			reason: `the task declared it cannot proceed: ${history.declaredBlocker}`,
			barrenOperations: barren,
		};
	}

	if (last === undefined) {
		return {
			state: 'exploring',
			shouldEscalate: false,
			reason: 'nothing has run yet, so there is nothing to judge',
			barrenOperations: 0,
		};
	}

	if (last.waitingOn !== undefined) {
		// Never escalates. Rotating an agent that is correctly queued
		// behind a lock throws away its place and puts a second agent
		// behind the same lock.
		return {
			state: 'waiting',
			shouldEscalate: false,
			reason: `waiting on ${last.waitingOn}, which is correct behaviour and not a stall`,
			barrenOperations: barren,
		};
	}

	if (last.acceptanceAdvanced > 0 || last.filesTouched.length > 0) {
		return {
			state: 'advancing',
			shouldEscalate: false,
			reason:
				last.acceptanceAdvanced > 0
					? `${last.acceptanceAdvanced.toString()} acceptance criteri${last.acceptanceAdvanced === 1 ? 'on' : 'a'} newly satisfied`
					: `${last.filesTouched.length.toString()} file(s) changed`,
			barrenOperations: 0,
		};
	}

	if (last.blockerChanged || last.stateChanged) {
		return {
			state: 'advancing',
			shouldEscalate: false,
			reason: 'the state moved, even though no file changed',
			barrenOperations: 0,
		};
	}

	if (last.newInformation) {
		// Reading and searching is real work with no output yet. It is
		// only a problem if it never converges, which the barren streak
		// below is what measures.
		return {
			state: 'exploring',
			shouldEscalate: false,
			reason: 'gathering information; nothing has changed yet, which is normal early on',
			barrenOperations: 0,
		};
	}

	if (barren >= history.barrenLimit) {
		return {
			state: 'stalled',
			shouldEscalate: true,
			reason: `${barren.toString()} consecutive operations produced no evidence of any kind (limit ${history.barrenLimit.toString()})`,
			barrenOperations: barren,
		};
	}

	if (barren > 1) {
		return {
			state: 'churning',
			shouldEscalate: false,
			reason: `${barren.toString()} operations in a row produced nothing; not yet a stall, but it is going the wrong way`,
			barrenOperations: barren,
		};
	}

	return {
		state: 'retrying',
		shouldEscalate: false,
		reason: 'the last operation produced no evidence; one on its own is ordinary',
		barrenOperations: barren,
	};
};
