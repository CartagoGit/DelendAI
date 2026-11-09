/**
 * queue-order.ts — runs one train: assemble it, dispatch its run, land
 * its members or blame the culprit. Every decision it takes (the step, the
 * order, the names) is read from the decisions module in core.
 */
import {
	trainRefName,
	type IIntegrationCertification,
	type ITrainCandidate,
	trainStep,
} from '@delendai/core/cli';

import type { ITrainPorts } from './queue-order.interface';

export type { ITrainPorts } from './queue-order.interface';

/**
 * Move one train forward and return the members that landed.
 *
 * The train is the integration tip with each member merged in order, so
 * one run of the union of their scopes, judged since the tip, proves them
 * all together. A member that conflicts leaves the train; a culprit is
 * blamed and leaves it; the rest go on.
 */
export const runTrain = (input: {
	readonly trainPrefix: string;
	readonly tipSha: string;
	readonly members: readonly ITrainCandidate[];
	readonly ports: ITrainPorts;
}): readonly number[] => {
	const { ports } = input;
	let pool = [...input.members];
	const byNumber = (numbers: readonly number[]): readonly ITrainCandidate[] =>
		numbers.flatMap((n) => pool.filter((c) => c.number === n));
	const refOf = (numbers: readonly number[]): string =>
		trainRefName(input.trainPrefix, input.tipSha, numbers);
	const stateOf = (numbers: readonly number[]): IIntegrationCertification => {
		const sha = ports.trainAt(refOf(numbers));
		return sha === undefined ? 'uncertified' : ports.runAt(sha);
	};
	const label = (numbers: readonly number[]): string =>
		numbers.map((n) => `#${String(n)}`).join(', ');
	// Each pass either acts and returns, or takes one member out.
	while (pool.length > 0) {
		const step = trainStep(
			pool.map((c) => c.number),
			stateOf,
		);
		if (step.kind === 'none') return [];
		if (step.kind === 'culprit') {
			const culprit = byNumber([step.number])[0];
			const fault =
				culprit === undefined
					? undefined
					: ports.trainFault?.(culprit, refOf([step.number]));
			if (culprit !== undefined && fault !== undefined) {
				// The member's own checks are green on its own head: the
				// train is red by itself. No marker; the train says so, one
				// issue carries it, and the members land one by one.
				const jobs = fault.length > 0 ? fault.join(', ') : 'unknown';
				ports.reportTrainRed?.(refOf([step.number]), culprit, fault);
				ports.say(
					`keep-the-queue-moving: the train's own checks are red: ${jobs}; #${String(step.number)} is not blamed, its own required checks are green.`,
				);
				return [];
			}
			if (culprit !== undefined) ports.blame(culprit);
			ports.say(
				`keep-the-queue-moving: #${String(step.number)} alone turns the train red; it leaves the train until its head moves.`,
			);
			pool = pool.filter((c) => c.number !== step.number);
			continue;
		}
		const ref = refOf(step.members);
		if (step.kind === 'wait') {
			ports.say(
				`keep-the-queue-moving: the train ${ref} (${label(step.members)}) is running its run.`,
			);
			return [];
		}
		if (step.kind === 'dispatch') {
			const { conflicting, pushFailure } = ports.assemble(
				ref,
				byNumber(step.members),
			);
			if (pushFailure !== undefined) {
				ports.say(
					`keep-the-queue-moving: the train ${ref} was not pushed, so nothing is dispatched: ${pushFailure}`,
				);
				return [];
			}
			if (conflicting.length > 0) {
				ports.say(
					`keep-the-queue-moving: ${conflicting.map((n) => `#${String(n)}`).join(', ')} conflict(s) with the train; left out of it.`,
				);
				const out = new Set(conflicting);
				pool = pool.filter((c) => !out.has(c.number));
				continue;
			}
			const started = ports.dispatch(ref);
			ports.say(
				started
					? `keep-the-queue-moving: dispatched one run of the union of its members' scopes on the train ${ref} (${label(step.members)}).`
					: `keep-the-queue-moving: could not dispatch the train ${ref}; the next run tries again.`,
			);
			return [];
		}
		const sha = ports.trainAt(ref) ?? '';
		if (step.culprit !== undefined) {
			const culprit = byNumber([step.culprit])[0];
			if (culprit !== undefined) ports.blame(culprit);
		}
		const landed = ports.land(sha, byNumber(step.members));
		ports.say(
			`keep-the-queue-moving: the train ${ref} is green; landed ${landed.map((n) => `#${String(n)}`).join(', ') || 'nothing'} of ${label(step.members)}.`,
		);
		return landed;
	}
	return [];
};
