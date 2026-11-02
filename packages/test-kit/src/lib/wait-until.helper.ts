/**
 * wait-until.helper.ts — wait for the thing, not for the clock.
 *
 * A spec that does its waiting with `await new Promise(r => setTimeout(r,
 * 400))` and then asserts is not testing the code; it is testing whether
 * the machine was fast enough that day. It passes on a developer's
 * laptop and fails on a loaded runner, which is the worst possible
 * distribution of outcomes: the failure arrives detached from the change
 * that caused it, and the usual response — a retry, or a bigger number —
 * hides whatever real race is underneath.
 *
 * Observed: `slice-replay` slept 400 ms for a poll and then asserted the
 * poll had happened. It passed five times out of five locally and failed
 * in CI with `expected 0 to be greater than 0`.
 *
 * So: state the CONDITION. The wait ends the moment it holds, which makes
 * the fast path fast, and the ceiling exists only to turn a hang into a
 * readable failure rather than a suite that never finishes.
 */
import { WAIT_INTERVAL_MS, WAIT_TIMEOUT_MS } from './wait-until.constant';

/**
 * Resolve as soon as `condition` returns true, or throw when it has not
 * within `timeoutMs`.
 *
 * `describe` is required rather than optional: a timeout that says
 * "condition not met" tells the next reader nothing, and they are
 * usually reading it because CI failed and they cannot reproduce it.
 */
export const waitUntil = async (
	describe: string,
	condition: () => boolean | Promise<boolean>,
	options: {
		readonly timeoutMs?: number;
		readonly intervalMs?: number;
	} = {},
): Promise<void> => {
	const timeoutMs = options.timeoutMs ?? WAIT_TIMEOUT_MS;
	const intervalMs = options.intervalMs ?? WAIT_INTERVAL_MS;
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (await condition()) return;
		if (Date.now() >= deadline) {
			throw new Error(
				`waitUntil: ${describe} did not become true within ${String(timeoutMs)}ms.`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
};
