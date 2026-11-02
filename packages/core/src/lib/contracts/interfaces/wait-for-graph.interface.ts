/**
 * The wait-for graph: who is blocked on whom.
 *
 * A lock file records who *holds* what. That is enough to grant and
 * release, and not enough to answer the one question a stuck swarm
 * actually has — is anyone waiting on someone who is waiting on them?
 * Deadlock is the only lock failure no timeout can resolve (both sides
 * time out, both retry, neither ever proceeds) and the only one that is
 * exactly decidable rather than heuristic. It just needs the edges to be
 * written down.
 *
 * This lives in core for the same reason the expiry rule does: the
 * plugin that publishes waits (`notification`, from `await_lock`) and
 * the plugin that reports on lock health (`proposals`, from
 * `agents_lock_diagnose`) must not import each other, and both have to
 * answer this question identically.
 */

/** One edge: `waiter` is blocked until `holder` releases. */
export interface IWaitForEdge {
	readonly waiter: string;
	readonly holder: string;
}

/** A closed cycle of waiters, in order, starting and ending at the same agent. */
export interface IWaitForCycle {
	readonly agents: readonly string[];
}
