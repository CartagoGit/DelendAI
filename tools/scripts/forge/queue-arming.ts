/**
 * queue-arming.ts — a candidate is armed on positive evidence only.
 *
 * The queue armed every candidate it accepted, and a candidate whose own
 * required checks were still running or missing was armed all the same.
 * Arming is now the answer to "is everything that decides this green",
 * not "is anything red yet".
 */
import type {
	IArmingCheckRun,
	IRequiredChecksVerdict,
} from './queue-arming.interface';

export type {
	IArmingCheckRun,
	IRequiredChecksVerdict,
} from './queue-arming.interface';

/**
 * Every required check, judged on the candidate's current head: passed
 * when one of its runs succeeded and none is still running; missing when
 * none ran; pending while one runs; failed otherwise.
 */
export const requiredChecksVerdict = (
	runs: readonly IArmingCheckRun[],
	required: readonly string[],
): IRequiredChecksVerdict => {
	const missing: string[] = [];
	const pending: string[] = [];
	const failed: string[] = [];
	for (const name of required) {
		const ofCheck = runs.filter((run) => run.name === name);
		if (ofCheck.length === 0) {
			missing.push(name);
			continue;
		}
		if (
			ofCheck.some(
				(run) =>
					(run.status !== undefined &&
						run.status !== null &&
						run.status !== 'completed') ||
					run.conclusion === null,
			)
		) {
			pending.push(name);
			continue;
		}
		if (!ofCheck.some((run) => run.conclusion === 'success')) {
			failed.push(name);
		}
	}
	return {
		passed:
			missing.length === 0 && pending.length === 0 && failed.length === 0,
		missing,
		pending,
		failed,
	};
};

/**
 * What the queue does now: arm the accepted candidates whose own required
 * checks passed, or, when two or more ride together, run them as one train
 * instead. Nothing here asks the integration branch for a full run: a pull
 * request's sectioned run, or a train's run of the union of its members'
 * scopes, is enough to land; the full suite runs on the promotion. A lone
 * pull request rides no train of one: its own sectioned checks decide.
 */
export const armingPlan = (input: {
	/** Accepted candidates whose required checks passed on their head. */
	readonly ready: readonly number[];
	/** The candidates that would ride the next train. */
	readonly riders: readonly number[];
}): { readonly arm: readonly number[]; readonly train: boolean } =>
	input.riders.length >= 2
		? { arm: [], train: true }
		: { arm: input.ready, train: false };
