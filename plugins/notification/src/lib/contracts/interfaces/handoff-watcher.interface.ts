/**
 * handoff-watcher.interface.ts — the shapes the handoff watcher trades in.
 *
 * Split from the implementation so the repo's "types live in contracts"
 * convention holds: `services/handoff-watcher.ts` keeps the behaviour,
 * this file keeps the shapes, and a consumer can depend on the contract
 * without pulling in the polling loop.
 */

/** One handoff a watching agent has not seen before. */
export interface IHandoffEvent {
	readonly file: string;
	readonly agent: string;
	readonly reason: string;
	readonly handoffPath: string;
}

/**
 * A poller over the handoff directory. `check()` is separate from
 * `start()` so a caller can drain once — at boot, say — without taking
 * on an interval it then has to remember to `stop()`.
 */
export interface IHandoffWatcher {
	check(): Promise<IHandoffEvent[]>;
	start(): void;
	stop(): void;
}
