import { describe, expect, it } from 'vitest';

import {
	SubprocessPool,
	type IPoolWorker,
	type ITimerSeam,
} from '../../../../src/lib/subprocess/pool';

class FakeWorker implements IPoolWorker {
	alive = true;
	disposeCalls = 0;
	isAlive(): boolean {
		return this.alive;
	}
	dispose(): void {
		this.disposeCalls += 1;
		this.alive = false;
	}
}

// A controllable timer seam: nothing fires until the test says so, and
// `active()` reports how many timers are still outstanding (the leak probe).
const makeTimers = () => {
	const timers: Array<{ fn: () => void; cleared: boolean }> = [];
	const seam: ITimerSeam = {
		setTimer(fn) {
			const entry = { fn, cleared: false };
			timers.push(entry);
			return {
				clear() {
					entry.cleared = true;
				},
			};
		},
	};
	return {
		seam,
		active: () => timers.filter((t) => !t.cleared).length,
	};
};

describe('SubprocessPool (CRITICAL C8 / no-leak)', () => {
	it('leases a live worker and returns the permit on release', async () => {
		const timers = makeTimers();
		const pool = new SubprocessPool({
			factory: () => new FakeWorker(),
			size: 2,
			concurrency: 4,
			timers: timers.seam,
		});
		const lease = await pool.acquire();
		expect(lease.worker.isAlive()).toBe(true);
		expect(pool.stats().workers).toBeGreaterThanOrEqual(1);
		lease.release();
		lease.release(); // idempotent — must not double-release the permit
		pool.dispose();
	});

	it('enforces the concurrency cap: extra acquirers park until a permit frees', async () => {
		const pool = new SubprocessPool({
			factory: () => new FakeWorker(),
			size: 2,
			concurrency: 2,
			timers: makeTimers().seam,
		});
		const l1 = await pool.acquire();
		const l2 = await pool.acquire();
		const p3 = pool.acquire(); // no permit → parks on the semaphore
		await Promise.resolve();
		expect(pool.stats().pendingPermits).toBe(1);
		l1.release(); // frees a permit → p3 resolves
		const l3 = await p3;
		expect(l3.worker.isAlive()).toBe(true);
		l2.release();
		l3.release();
		pool.dispose();
	});

	it('dispose() zeroes every handle: workers killed, timers cleared, waiters rejected', async () => {
		const timers = makeTimers();
		let fail = true;
		const pool = new SubprocessPool({
			// First worker creation fails → schedules a backoff restart AND
			// parks the acquirer as a waiter: the exact leak-prone state.
			factory: () => {
				if (fail) throw new Error('boom');
				return new FakeWorker();
			},
			size: 2,
			concurrency: 4,
			timers: timers.seam,
		});
		const parked = pool.acquire();
		await Promise.resolve();
		expect(pool.stats().scheduledRestarts).toBe(1);
		expect(pool.stats().pendingWaiters).toBe(1);
		expect(timers.active()).toBe(1);

		fail = false;
		pool.dispose();

		expect(pool.stats()).toMatchObject({
			workers: 0,
			scheduledRestarts: 0,
			pendingWaiters: 0,
			disposed: true,
		});
		expect(timers.active()).toBe(0);
		await expect(parked).rejects.toThrow(/disposed/);
	});

	it('rejects acquire() after dispose', async () => {
		const pool = new SubprocessPool({
			factory: () => new FakeWorker(),
			timers: makeTimers().seam,
		});
		pool.dispose();
		await expect(pool.acquire()).rejects.toThrow(/disposed/);
	});

	it('prunes a crashed worker and disposes it', async () => {
		const created: FakeWorker[] = [];
		const pool = new SubprocessPool({
			factory: () => {
				const w = new FakeWorker();
				created.push(w);
				return w;
			},
			size: 1,
			concurrency: 4,
			timers: makeTimers().seam,
		});
		const l1 = await pool.acquire();
		l1.release();
		created[0]!.alive = false; // simulate a crash
		const l2 = await pool.acquire(); // must prune the dead one + make a fresh worker
		expect(created[0]!.disposeCalls).toBeGreaterThan(0);
		expect(l2.worker).not.toBe(created[0]);
		expect(l2.worker.isAlive()).toBe(true);
		l2.release();
		pool.dispose();
	});
});
