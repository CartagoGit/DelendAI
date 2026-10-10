/**
 * How the lock engine asks whether a claim's owner still exists.
 *
 * Injected rather than hard-wired so the orphan check can be exercised
 * deterministically: a real `process.kill(pid, 0)` cannot be made to
 * report a dead pid on demand.
 */
export interface ILockLivenessProbe {
	/** This host's identifier, matched against `entry.host`. */
	readonly host: string;
	/** Whether a pid on THIS host is still running. */
	readonly isProcessAlive: (pid: number) => boolean;
}
