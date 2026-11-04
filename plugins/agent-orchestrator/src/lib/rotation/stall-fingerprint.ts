/**
 * stall-fingerprint.ts — f00504 S2.
 *
 * One fingerprint that says whether an operation is a repeat that
 * matters, so the two existing detectors stop each keeping their own
 * idea of repetition.
 *
 * Both current detectors key on the operation: the tool, its arguments,
 * a window, a cooldown. That catches real loops and also catches honest
 * work, because a legitimate agent repeats itself constantly — re-reading
 * the file it is editing, re-running the spec after every fix. A detector
 * that fires on those gets muted, and a muted detector protects nothing.
 *
 * The fingerprint here therefore includes the STATE, not just the call:
 * tool, arguments, the digest of what went in, the digest of what came
 * out, and the digest of the task afterwards. Two operations collide only
 * when literally nothing about the situation differs — same call, same
 * inputs, same outputs, same resulting state. That is the definition of
 * a revalidation that cannot teach anyone anything, and it is what makes
 * the signal worth acting on.
 *
 * The consequence worth stating: a repeated call whose task digest moved
 * is not a loop, however many times it repeats. That is the false
 * positive this module exists to remove.
 */
import { createHash } from 'node:crypto';

export interface IOperationFingerprintInput {
	readonly tool: string;
	/** Canonical, already-serialised arguments. */
	readonly args: string;
	/** Digest of what the operation read. */
	readonly inputDigest: string;
	/** Digest of what it produced. */
	readonly outputDigest: string;
	/** Digest of the task's state AFTER it ran. */
	readonly taskDigest: string;
}

/**
 * A stable fingerprint.
 *
 * Fields are length-prefixed before hashing so no two different
 * operations can collide by shifting a delimiter across a boundary — a
 * tool named `a:b` with args `c` must not hash like tool `a` with args
 * `b:c`, or one operation would silently be read as a repeat of
 * another's.
 */
export const fingerprintOperation = (
	input: IOperationFingerprintInput,
): string => {
	const canonical = [
		input.tool,
		input.args,
		input.inputDigest,
		input.outputDigest,
		input.taskDigest,
	]
		.map((part) => `${part.length.toString()}:${part}`)
		.join('');
	return createHash('sha256').update(canonical).digest('hex');
};

export interface IRepetitionVerdict {
	/** True only when the exact same situation recurred. */
	readonly isLoop: boolean;
	/** How many times this exact fingerprint appears in the window. */
	readonly occurrences: number;
	readonly reason: string;
}

/**
 * Whether the newest operation is a repeat that teaches nobody anything.
 *
 * `threshold` is how many identical occurrences make a loop. Two is
 * usually right: doing the identical thing twice, with identical results
 * and an unchanged task, has already wasted one operation.
 */
export const judgeRepetition = (
	window: readonly IOperationFingerprintInput[],
	threshold = 2,
): IRepetitionVerdict => {
	const latest = window.at(-1);
	if (latest === undefined) {
		return {
			isLoop: false,
			occurrences: 0,
			reason: 'nothing has run yet',
		};
	}
	const target = fingerprintOperation(latest);
	const occurrences = window.filter(
		(operation) => fingerprintOperation(operation) === target,
	).length;

	if (occurrences < threshold) {
		return {
			isLoop: false,
			occurrences,
			reason: `this exact situation has occurred ${occurrences.toString()} time(s), below the ${threshold.toString()} that make a loop`,
		};
	}

	return {
		isLoop: true,
		occurrences,
		reason: `${latest.tool} ran ${occurrences.toString()} times with identical arguments, identical inputs, identical outputs and an unchanged task state — the repetition cannot produce a different answer`,
	};
};

/**
 * The shape the two existing detectors adapt to, so neither keeps its
 * own notion of repetition.
 *
 * The point of a shared type is that a detector reports what it OBSERVED
 * and lets this module decide what it means. A detector that decided for
 * itself would be back to disagreeing with the other one, which is the
 * problem.
 */
export interface IDetectorObservation {
	readonly detectorId: string;
	readonly operation: IOperationFingerprintInput;
}

export const fingerprintObservations = (
	observations: readonly IDetectorObservation[],
	threshold = 2,
): IRepetitionVerdict =>
	judgeRepetition(
		observations.map((observation) => observation.operation),
		threshold,
	);
