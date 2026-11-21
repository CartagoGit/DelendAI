/**
 * Lock health, extended to the failure that only exists between agents.
 *
 * `agents_lock_diagnose` could already name zombies, orphaned temp files
 * and log gaps — every way a lock goes wrong by itself. It could say
 * nothing about who is blocked on whom, so an operator looking at a
 * stalled swarm saw a lock file full of healthy, heartbeating claims and
 * no explanation at all.
 */
export interface IWaitReport {
	readonly waiter: string;
	readonly waitingOnTaskId: string;
	readonly holder: string | null;
	readonly waitingForSeconds: number | null;
}
export interface IWaitDiagnostics {
	readonly waits: readonly IWaitReport[];
	/** Closed cycles of waiters. A non-empty list is a real deadlock. */
	readonly deadlocks: readonly (readonly string[])[];
}
