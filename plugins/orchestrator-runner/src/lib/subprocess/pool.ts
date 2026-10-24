/**
 * pool.ts — a generic, leak-free subprocess pool (f00067 S6, CRITICAL C8).
 *
 * A minimal, dependency-free primitive that owns a small set of long-lived
 * "workers" (e.g. one `codex mcp-server` process per provider) plus a
 * concurrency semaphore. It is GENERIC over the worker type so it never
 * imports vendor vocabulary — the plugin decides what a worker is. It could
 * move to `core/src/lib/shared/` once a second consumer exists.
 *
 * Invariants honoured:
 *  - Pool size 2 by default; concurrency limit 4 by default.
 *  - Auto-restart on crash with EXPONENTIAL backoff (base doubles, capped).
 *  - Explicit {@link SubprocessPool.dispose}: kills every worker, clears every
 *    timer, rejects every waiter. After `dispose()` the pool reports zero
 *    live workers, zero scheduled restarts and zero pending waiters — the
 *    leak assertion the S6 acceptance requires.
 *  - Every internal timer is `unref()`'d so the pool NEVER keeps the Node
 *    process alive on its own (AGENTS.md rule: unref timers).
 *
 * The clock and timer are injectable so tests advance time deterministically
 * and assert zero leaked handles without touching real wall-clock time.
 */

/** A pooled worker. The pool only needs to create, health-check and kill it. */
export interface IPoolWorker {
	/** Whether the worker is still usable. A crashed worker returns false. */
	isAlive(): boolean;
	/** Terminate the worker and release its handles. Must be idempotent. */
	dispose(): void;
}

/** Injectable timer seam so tests never touch real wall-clock time. */
export interface ITimerSeam {
	setTimer(fn: () => void, ms: number): { clear(): void };
}

const defaultTimerSeam: ITimerSeam = {
	setTimer(fn, ms) {
		const handle = setTimeout(fn, ms);
		handle.unref?.();
		return {
			clear() {
				clearTimeout(handle);
			},
		};
	},
};

export interface ISubprocessPoolOptions<W extends IPoolWorker> {
	/** Create a fresh worker. Throwing here schedules a backoff retry. */
	readonly factory: () => W;
	/** Max long-lived workers. Default 2. */
	readonly size?: number;
	/** Max concurrent leases across all workers. Default 4. */
	readonly concurrency?: number;
	/** Backoff base (ms) for the first restart. Default 200. */
	readonly backoffBaseMs?: number;
	/** Backoff ceiling (ms). Default 30_000. */
	readonly backoffMaxMs?: number;
	/** Injectable timer seam (tests). Default real `setTimeout` (unref'd). */
	readonly timers?: ITimerSeam;
}

/** A concurrency lease. Call {@link ILease.release} exactly once when done. */
export interface ILease<W> {
	readonly worker: W;
	release(): void;
}

interface IWaiter<W> {
	resolve(lease: ILease<W>): void;
	reject(err: Error): void;
}

/**
 * A counting semaphore backing the pool's concurrency cap. Kept private to
 * the pool so callers never bypass it.
 */
class Semaphore {
	private available: number;
	private readonly queue: Array<() => void> = [];

	constructor(permits: number) {
		this.available = permits;
	}

	acquire(): Promise<void> {
		if (this.available > 0) {
			this.available -= 1;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			this.queue.push(resolve);
		});
	}

	release(): void {
		const next = this.queue.shift();
		if (next !== undefined) {
			next();
			return;
		}
		this.available += 1;
	}

	get pending(): number {
		return this.queue.length;
	}

	/** Reject-free drain: hand every queued waiter a resolve so they unblock. */
	drain(): void {
		while (this.queue.length > 0) this.queue.shift()?.();
	}
}

export class SubprocessPool<W extends IPoolWorker> {
	private readonly factory: () => W;
	private readonly size: number;
	private readonly backoffBaseMs: number;
	private readonly backoffMaxMs: number;
	private readonly timers: ITimerSeam;
	private readonly sem: Semaphore;

	private readonly workers: W[] = [];
	private readonly restartTimers = new Set<{ clear(): void }>();
	private readonly waiters: Array<IWaiter<W>> = [];
	private restartAttempts = 0;
	private disposed = false;

	constructor(options: ISubprocessPoolOptions<W>) {
		this.factory = options.factory;
		this.size = options.size ?? 2;
		this.backoffBaseMs = options.backoffBaseMs ?? 200;
		this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
		this.timers = options.timers ?? defaultTimerSeam;
		this.sem = new Semaphore(options.concurrency ?? 4);
	}

	/**
	 * Acquire a live worker + a concurrency permit. Resolves once both a
	 * permit is free and a worker is alive. Rejects if the pool is disposed.
	 */
	async acquire(): Promise<ILease<W>> {
		if (this.disposed) throw new Error('subprocess-pool: disposed');
		await this.sem.acquire();
		if (this.disposed) {
			this.sem.release();
			throw new Error('subprocess-pool: disposed');
		}
		const worker = this.ensureWorker();
		if (worker !== undefined) return this.leaseFor(worker);

		// No live worker right now (crashed + waiting on backoff). Park the
		// caller; a successful restart hands the lease off. The permit is held
		// meanwhile so we never exceed the concurrency cap.
		return new Promise<ILease<W>>((resolve, reject) => {
			this.waiters.push({
				resolve,
				reject,
			});
		});
	}

	private leaseFor(worker: W): ILease<W> {
		let released = false;
		return {
			worker,
			release: () => {
				if (released) return;
				released = true;
				this.sem.release();
			},
		};
	}

	/** Return a live worker, pruning dead ones and lazily filling the pool. */
	private ensureWorker(): W | undefined {
		// Drop crashed workers and schedule their replacement.
		for (let i = this.workers.length - 1; i >= 0; i -= 1) {
			const w = this.workers[i];
			if (w !== undefined && !w.isAlive()) {
				w.dispose();
				this.workers.splice(i, 1);
				this.scheduleRestart();
			}
		}
		if (this.workers.length < this.size) {
			try {
				const created = this.factory();
				this.workers.push(created);
				this.restartAttempts = 0;
				return created;
			} catch {
				this.scheduleRestart();
			}
		}
		return this.workers[0];
	}

	/** Exponential backoff restart. Timer is unref'd + tracked for dispose. */
	private scheduleRestart(): void {
		if (this.disposed) return;
		const attempt = this.restartAttempts;
		this.restartAttempts = attempt + 1;
		const delay = Math.min(
			this.backoffMaxMs,
			this.backoffBaseMs * 2 ** attempt,
		);
		const handle = this.timers.setTimer(() => {
			this.restartTimers.delete(handle);
			if (this.disposed) return;
			const worker = this.ensureWorker();
			if (worker !== undefined) this.flushWaiters(worker);
		}, delay);
		this.restartTimers.add(handle);
	}

	/** Hand a freshly-restarted worker to any parked waiters. */
	private flushWaiters(worker: W): void {
		while (this.waiters.length > 0) {
			const waiter = this.waiters.shift();
			if (waiter === undefined) break;
			if (!worker.isAlive()) {
				this.waiters.unshift(waiter);
				this.scheduleRestart();
				return;
			}
			waiter.resolve(this.leaseFor(worker));
		}
	}

	/** Introspection for the leak assertion + health tooling. */
	stats(): {
		readonly workers: number;
		readonly scheduledRestarts: number;
		readonly pendingWaiters: number;
		readonly pendingPermits: number;
		readonly disposed: boolean;
	} {
		return {
			workers: this.workers.length,
			scheduledRestarts: this.restartTimers.size,
			pendingWaiters: this.waiters.length,
			pendingPermits: this.sem.pending,
			disposed: this.disposed,
		};
	}

	/**
	 * Tear everything down: kill every worker, clear every backoff timer,
	 * reject every parked waiter, drain the semaphore. After this `stats()`
	 * reports all-zero — the S6 no-leak guarantee.
	 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const handle of this.restartTimers) handle.clear();
		this.restartTimers.clear();
		for (const worker of this.workers) worker.dispose();
		this.workers.length = 0;
		for (const waiter of this.waiters) {
			waiter.reject(new Error('subprocess-pool: disposed'));
		}
		this.waiters.length = 0;
		this.sem.drain();
	}
}
