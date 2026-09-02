/**
 * What `await_lock` tells an agent when the wait did NOT succeed.
 *
 * The wait itself was already correct — fs.watch plus a poll fallback,
 * expiry-aware, bounded by `timeoutMs`. What was missing is the answer
 * to the only question the agent actually has when it comes back
 * empty-handed: *and now what?* A result of `{released:false,
 * timedOut:true}` and nothing else leaves exactly one rational move —
 * wait again — which is an unbounded loop between two agents that can
 * never make progress. A lock subsystem may block an agent; it may
 * never leave one without a next step.
 */

/** Why the wait ended without the lock coming free. */
export type WaitVerdict =
	/** The holder is alive and heartbeating. It really is still working. */
	| 'holder-alive'
	/**
	 * Nobody holds it. The claim is free right now — the waiter raced a
	 * release, or the entry expired while we waited.
	 */
	| 'free-now'
	/**
	 * The entry is still in the file but past its heartbeat window, or its
	 * owning process is gone. The lock engine will evict it on the next
	 * claim, so the waiter must claim, not wait.
	 */
	| 'holder-gone'
	/**
	 * The holder is itself waiting on something this waiter holds. Waiting
	 * again can never resolve; one side has to give way.
	 */
	| 'mutual-wait';

export interface IWaitHolderInfo {
	readonly taskId: string;
	readonly agent: string;
	readonly files: readonly string[];
	/** ISO timestamp of the holder's last heartbeat, when it recorded one. */
	readonly lastSeen: string | undefined;
	/** Milliseconds since that heartbeat, when it can be computed. */
	readonly heldForMs: number | undefined;
}

export interface IWaitDiagnosis {
	readonly verdict: WaitVerdict;
	/** The claim that blocked the wait, when one is still recorded. */
	readonly holder: IWaitHolderInfo | undefined;
	/** One sentence an operator can read, stating what was observed. */
	readonly reason: string;
	/**
	 * The concrete next call. Never "wait again" — every verdict resolves
	 * to a different action than the one that just failed, so an agent
	 * following this field cannot loop.
	 */
	readonly nextAction: string;
}
