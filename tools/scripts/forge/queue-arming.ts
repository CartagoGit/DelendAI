/**
 * queue-arming.ts — a candidate is armed on positive evidence only.
 *
 * The queue armed every candidate it accepted unless the integration
 * branch was red: one whose full run had not finished, or never ran, was
 * armed all the same, and so was a candidate whose own required checks
 * were still running or missing. Arming is now the answer to "is
 * everything that decides this green", not "is anything red yet".
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

/** The integration branch certifies arming only once its full run is green. */
export const integrationAllowsArming = (state: string): boolean =>
	state === 'certified';
