/**
 * lock-pause.helper.ts — skip the pause between two attempts at a lock.
 *
 * A caller that retries a held lock after a fixed pause makes its spec
 * wait that pause for every attempt. The pause is skipped; `onPause` runs
 * where the pause would have passed, so a case can let go of the lock
 * exactly then and the retries still run.
 */
import { onTestFinished, vi } from 'vitest';

/** Stubs `setTimeout` for pauses of `pauseMs` for the current case. */
export const skipLockPauses = (pauseMs: number, onPause?: () => void): void => {
	const real = globalThis.setTimeout;
	vi.stubGlobal('setTimeout', (callback: () => void, ms?: number) => {
		if (ms === pauseMs) onPause?.();
		return real(callback, 0);
	});
	onTestFinished(() => {
		vi.unstubAllGlobals();
	});
};
