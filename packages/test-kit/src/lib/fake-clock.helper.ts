/**
 * fake-clock.helper.ts — the one way a spec stops waiting for real time.
 *
 * Code that waits on `setTimeout`, `setInterval` or `Date` is tested by
 * moving a fake clock, not by sleeping: the wait is zero and the outcome
 * does not depend on how loaded the machine is. Setup and teardown are in
 * one place so no spec leaves fake timers behind for the next one.
 */
import { onTestFinished, vi } from 'vitest';
import type { IFakeClock } from '../contracts/interfaces/fake-clock.interface';

/**
 * Fake the timers (and `Date`) for the current case, restoring them after
 * it. `toFake` narrows the fake to what the code under test uses, so the
 * runner's own clock is left alone.
 */
export const useFakeClock = (
	options: {
		readonly now?: number | Date;
		readonly toFake?: readonly (
			| 'setTimeout'
			| 'clearTimeout'
			| 'setInterval'
			| 'clearInterval'
			| 'Date'
		)[];
	} = {},
): IFakeClock => {
	vi.useFakeTimers({
		...(options.toFake === undefined
			? {}
			: { toFake: [...options.toFake] }),
		...(options.now === undefined ? {} : { now: options.now }),
	});
	onTestFinished(() => {
		vi.useRealTimers();
	});
	return {
		advance: (ms) => {
			vi.advanceTimersByTime(ms);
		},
		advanceAsync: async (ms) => {
			await vi.advanceTimersByTimeAsync(ms);
		},
		runAll: () => {
			vi.runAllTimers();
		},
	};
};
