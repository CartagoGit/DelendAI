/**
 * session.ts — routing session stickiness (CRITICAL I12).
 *
 * A caller that passes a `sessionId` gets the SAME routing decision back
 * for `sessionStickinessTtlSeconds` (default 300) so a multi-step task
 * does not thrash between providers mid-flight. Entries are held in a
 * plain in-memory `Map` (never persisted — a decision is cheap to
 * recompute after a restart) and pruned:
 *
 *  - lazily on every `get` (an expired entry is dropped and treated as a
 *    miss), and
 *  - proactively by a periodic sweep (default every 5 min) started via
 *    {@link SessionStore.startPruneTimer}. That timer is `unref()`'d so it
 *    NEVER keeps the Node process alive on its own.
 *
 * The clock is injected (`now`) so tests advance time deterministically
 * without fake timers.
 */
import type { IRoutingDecision } from '@mcp-vertex/core/public';

export const DEFAULT_SESSION_TTL_SECONDS = 300;
export const DEFAULT_PRUNE_INTERVAL_MS = 5 * 60 * 1000;

interface IStickyEntry {
	readonly decision: IRoutingDecision;
	readonly expiresAt: number;
}

export interface ISessionStoreOptions {
	/** TTL in seconds. Default 300. */
	readonly ttlSeconds?: number;
	/** Injectable clock (ms epoch). Default `Date.now`. */
	readonly now?: () => number;
}

export class SessionStore {
	private readonly entries = new Map<string, IStickyEntry>();
	private readonly ttlMs: number;
	private readonly now: () => number;
	private timer: ReturnType<typeof setInterval> | undefined;

	constructor(options: ISessionStoreOptions = {}) {
		this.ttlMs = (options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS) * 1000;
		this.now = options.now ?? Date.now;
	}

	/** Remember a decision for `sessionId` until its TTL elapses. */
	set(sessionId: string, decision: IRoutingDecision): void {
		this.entries.set(sessionId, {
			decision,
			expiresAt: this.now() + this.ttlMs,
		});
	}

	/**
	 * The sticky decision for `sessionId`, or `undefined` when absent or
	 * expired. An expired hit is evicted as a side effect (lazy prune).
	 */
	get(sessionId: string): IRoutingDecision | undefined {
		const entry = this.entries.get(sessionId);
		if (entry === undefined) return undefined;
		if (entry.expiresAt <= this.now()) {
			this.entries.delete(sessionId);
			return undefined;
		}
		return entry.decision;
	}

	/** Drop every expired entry. Returns the number evicted. */
	prune(): number {
		const cutoff = this.now();
		let evicted = 0;
		for (const [id, entry] of this.entries) {
			if (entry.expiresAt <= cutoff) {
				this.entries.delete(id);
				evicted += 1;
			}
		}
		return evicted;
	}

	/** Current live (non-expired counting excluded) entry count. */
	get size(): number {
		return this.entries.size;
	}

	/**
	 * Start the periodic prune sweep. The interval handle is `unref()`'d so
	 * it can never block process exit. Idempotent: a second call is a no-op
	 * while a timer is already running.
	 */
	startPruneTimer(intervalMs: number = DEFAULT_PRUNE_INTERVAL_MS): void {
		if (this.timer !== undefined) return;
		this.timer = setInterval(() => {
			this.prune();
		}, intervalMs);
		this.timer.unref?.();
	}

	/** Stop the prune sweep and release the timer handle. */
	stop(): void {
		if (this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}
}
