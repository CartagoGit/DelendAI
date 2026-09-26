/**
 * mutex-wait.ts — take the startup mutex, waiting a bounded time for a
 * concurrent boot (x00662).
 *
 * Two servers on one workspace start together routinely: every client
 * (an editor, an agent host) starts its own. The loser used to give up at
 * once and report a broken workspace.
 */
import type { IReconcileStartupInput } from './reconcile-startup.interface';

/**
 * Default wait for a concurrent boot: long enough for an incremental
 * reconcile (seconds), short enough that the MCP client, which waits for
 * `initialize` while this runs, does not give up first.
 */
const MUTEX_WAIT_DEFAULT = { timeoutMs: 10_000, pollMs: 500 } as const;

/**
 * Take the mutex, waiting a bounded time for a concurrent boot to finish
 * instead of giving up at once: that boot usually needs seconds, and this
 * one can then reconcile incrementally on top of it.
 */
export const acquireWaiting = async (
	input: IReconcileStartupInput,
): ReturnType<IReconcileStartupInput['mutex']['acquire']> => {
	const wait = input.mutexWait ?? MUTEX_WAIT_DEFAULT;
	const sleep =
		input.mutexWait?.sleep ??
		((ms: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, ms)));
	// Bounded by attempts, not by the clock: a clock that does not move
	// (a test's, a suspended VM's) must not turn the wait into a hang.
	const attempts = Math.ceil(wait.timeoutMs / Math.max(1, wait.pollMs));
	let lock = await input.mutex.acquire();
	for (let tried = 0; lock.kind === 'busy' && tried < attempts; tried += 1) {
		await sleep(wait.pollMs);
		lock = await input.mutex.acquire();
	}
	return lock;
};
