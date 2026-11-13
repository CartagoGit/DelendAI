/**
 * abort-signal-timeout.helper.ts — `AbortSignal.timeout` that a spec fires.
 *
 * `AbortSignal.timeout` counts on the platform clock, which fake timers do
 * not reach, so a spec of "a hung request is aborted" waited out the real
 * deadline (5 to 16 s). The stub hands the code under test a signal the
 * spec controls: `fire()` is the deadline elapsing.
 */
import { onTestFinished, vi } from 'vitest';
import type { IAbortSignalTimeoutStub } from '../contracts/interfaces/abort-signal-timeout.interface';

/** Stub `AbortSignal.timeout` for the current case; restored after it. */
export const stubAbortSignalTimeout = (): IAbortSignalTimeoutStub => {
	const controllers: AbortController[] = [];
	const durations: number[] = [];
	const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
		const controller = new AbortController();
		controllers.push(controller);
		durations.push(ms);
		return controller.signal;
	});
	onTestFinished(() => {
		spy.mockRestore();
	});
	return {
		requested: () => durations,
		count: () => controllers.length,
		fire: (index) => {
			const targets =
				index === undefined
					? controllers
					: controllers.slice(index, index + 1);
			for (const controller of targets) controller.abort();
		},
	};
};
