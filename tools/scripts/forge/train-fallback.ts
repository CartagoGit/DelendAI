/**
 * train-fallback.ts — a train that cannot run never blocks what can land.
 *
 * Every accepted candidate rides a train, and the caller cleared every
 * landing the moment a train was attempted. A train that could not be
 * assembled, pushed or dispatched therefore landed nothing at all,
 * including the fix to the train itself: it happened twice in one night
 * and the owner merged by hand. When the train cannot run, the queue lands
 * each accepted candidate through its own pull request, as it did before
 * trains, judged by that candidate's own green required checks; and says
 * why.
 */
import type { ITrainPorts } from './queue-order.interface';

/** The train ports, watched for the first thing that stops the train. */
export interface IWatchedTrain {
	readonly ports: ITrainPorts;
	/** Why the train could not run, or `undefined` while it can. */
	readonly failure: () => string | undefined;
	/** Record a failure the ports could not see (a throw out of the train). */
	readonly fail: (why: string) => void;
}

const reasonOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Wrap `ports` so that a train which is not pushed, not dispatched or
 * cannot be assembled is recorded. The ports behave exactly as before.
 */
export const watchTrainPorts = (ports: ITrainPorts): IWatchedTrain => {
	let failure: string | undefined;
	const fail = (why: string): void => {
		failure ??= why;
	};
	return {
		failure: () => failure,
		fail,
		ports: {
			...ports,
			assemble: (ref, members) => {
				try {
					const built = ports.assemble(ref, members);
					if (built.pushFailure !== undefined) {
						fail(
							`the train ${ref} was not pushed: ${built.pushFailure}`,
						);
					}
					return built;
				} catch (error) {
					fail(
						`the train ${ref} could not be assembled: ${reasonOf(error)}`,
					);
					throw error;
				}
			},
			reportTrainRed: (ref, candidate, jobs) => {
				// The members take the individual landing path: the train is
				// the thing that cannot run.
				fail(
					`the train's own checks are red: ${jobs.length > 0 ? jobs.join(', ') : 'unknown'}`,
				);
				ports.reportTrainRed?.(ref, candidate, jobs);
			},
			dispatch: (ref) => {
				const started = ports.dispatch(ref);
				if (!started) fail(`the train ${ref} could not be dispatched`);
				return started;
			},
		},
	};
};

/**
 * Run a train and decide what lands this pass. A healthy train, running or
 * waiting on its full run, lands through the train: nothing lands by its
 * own merge. A train that could not run hands back `own`, the candidates
 * that land as they are, and the line that says why.
 */
export const landingAfterTrain = (input: {
	readonly watch: IWatchedTrain;
	readonly run: () => void;
	readonly own: ReadonlySet<number>;
}): { readonly landing: ReadonlySet<number>; readonly said?: string } => {
	try {
		input.run();
	} catch (error) {
		input.watch.fail(`the train threw: ${reasonOf(error)}`);
	}
	const why = input.watch.failure();
	if (why === undefined) return { landing: new Set() };
	return {
		landing: new Set(input.own),
		said:
			input.own.size === 0
				? `keep-the-queue-moving: ${why}; no accepted candidate lands as it is either, so nothing lands this pass; the candidates behind are brought forward one by one (refresh-candidate-artifacts) and land by their own merge once green.`
				: `keep-the-queue-moving: ${why}; the accepted candidate(s) ${[...input.own].map((n) => `#${String(n)}`).join(', ')} land by their own merge, judged by their own required checks.`,
	};
};
