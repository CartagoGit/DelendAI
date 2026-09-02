import { PUSH_CIRCUIT_THRESHOLD } from '../contracts/constants/push-circuit.constant';

import type { IPushCircuitDecision } from '../contracts/interfaces/push-circuit.interface';

/**
 * Stop retrying a push that cannot succeed.
 *
 * Observed live: this repo configures `push.branch: "develop"` while its
 * own pre-push discipline blocks every direct push to `develop`. The
 * scheduler retried that identical, guaranteed-to-fail push once a
 * minute for **twelve hours**, writing the same warning each time.
 * Nothing was learned after the first attempt and nothing could be: the
 * refusal was a policy, not a race.
 *
 * A transient failure — a ref lock lost to a concurrent agent, a network
 * blip, an index.lock — produces a *different* message each time, or
 * succeeds on the next try. A policy refusal produces the byte-identical
 * message forever. So the breaker needs no catalogue of error strings
 * and cannot go stale as new refusals appear: it counts consecutive
 * *identical* failures and opens after {@link PUSH_CIRCUIT_THRESHOLD}.
 *
 * Open means the automatic path stops attempting and says so once. It
 * never disables the explicit push tool — an operator who asks for a
 * push gets a real attempt and a real answer, and a success closes the
 * breaker again.
 */

export interface IPushCircuit {
	/** Record an attempt's outcome and get the resulting state. */
	record(result: {
		readonly ok: boolean;
		readonly refusal?: string;
	}): IPushCircuitDecision;
	/** Should the AUTOMATIC path attempt a push at all? */
	shouldAttempt(): boolean;
	/** Force the breaker closed (an explicit push is about to run). */
	reset(): void;
}

export const createPushCircuit = (
	threshold: number = PUSH_CIRCUIT_THRESHOLD,
): IPushCircuit => {
	let lastRefusal: string | undefined;
	let identicalFailures = 0;
	let open = false;
	let announced = false;

	return {
		record: (result): IPushCircuitDecision => {
			if (result.ok) {
				lastRefusal = undefined;
				identicalFailures = 0;
				open = false;
				announced = false;
				return { open: false, announce: false, identicalFailures: 0 };
			}
			const refusal = result.refusal ?? '';
			if (refusal === lastRefusal) {
				identicalFailures += 1;
			} else {
				// A different reason is new information: report it, and
				// give the new failure its own budget of attempts.
				lastRefusal = refusal;
				identicalFailures = 1;
				open = false;
				announced = false;
			}
			if (identicalFailures >= threshold) open = true;
			const announce = open && !announced;
			if (announce) announced = true;
			return {
				open,
				announce,
				identicalFailures,
				...(open ? { refusal } : {}),
			};
		},
		shouldAttempt: (): boolean => !open,
		reset: (): void => {
			lastRefusal = undefined;
			identicalFailures = 0;
			open = false;
			announced = false;
		},
	};
};

/**
 * The one line written when the breaker opens. States what stopped, why
 * it cannot fix itself, and what a person has to change — a silent stop
 * would be worse than the loop it replaces.
 */
export const buildPushCircuitNotice = (input: {
	readonly refusal: string;
	readonly attempts: number;
}): string =>
	`[mcp-vertex] commit-policy has stopped pushing automatically: the last ${input.attempts} attempts failed identically, so this is a policy refusal, not a race, and retrying cannot change it. Reason: ${input.refusal}. ` +
	'Nothing is lost — commits are still being made locally and an explicit push still works. Fix the configuration that is being refused (commonly `push.branch` naming a branch this repo only accepts through a pull request), then push once to clear this.';
