import {
	existsSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	__resetWithFileMutexTestHooks,
	__setWithFileMutexTestHooks,
	LockContentionError,
	withFileMutex,
} from '../../../../src/lib/shared/with-file-mutex';
import { createInMemoryMutexMetricsCollector } from '../../../../src/lib/shared/mutex-metrics.helper';

describe('withFileMutex reclaim', () => {
	let dir = '';
	let target = '';
	let lockPath = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mutex-reclaim-'));
		target = join(dir, 'state.json');
		lockPath = `${target}.mutex`;
	});

	afterEach(() => {
		__resetWithFileMutexTestHooks();
		rmSync(dir, { recursive: true, force: true });
	});

	it('does not reclaim when a holder heartbeats between stale observation and reclaim', async () => {
		writeFileSync(lockPath, `${process.pid}\n0\nlive-holder`);
		const old = new Date(Date.now() - 60_000);
		utimesSync(lockPath, old, old);

		let entered = false;
		let observedCount = 0;
		__setWithFileMutexTestHooks({
			afterObserveStale: async () => {
				observedCount += 1;
				const now = new Date();
				utimesSync(lockPath, now, now);
			},
		});

		await expect(
			withFileMutex(
				target,
				async () => {
					entered = true;
				},
				{
					onContention: 'fail',
					timeoutMs: 80,
					staleMs: 1_000,
					pollMs: 10,
				},
			),
		).rejects.toBeInstanceOf(LockContentionError);

		expect(entered).toBe(false);
		expect(observedCount).toBe(1);
		expect(existsSync(lockPath)).toBe(true);
	});

	it('reclaims a genuinely stale lock and enters the critical section', async () => {
		writeFileSync(lockPath, `${process.pid}\n0\nstale-holder`);
		const old = new Date(Date.now() - 60_000);
		utimesSync(lockPath, old, old);

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
			},
			{ timeoutMs: 100, staleMs: 1_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
		expect(existsSync(lockPath)).toBe(false);
	});

	it('records aggregate contention metrics without exposing paths', async () => {
		const metrics = createInMemoryMutexMetricsCollector();

		writeFileSync(lockPath, `${process.pid}\n0\nstale-holder`);
		const staleTime = new Date(Date.now() - 60_000);
		utimesSync(lockPath, staleTime, staleTime);

		await withFileMutex(target, async () => undefined, {
			timeoutMs: 100,
			staleMs: 1_000,
			pollMs: 10,
			metrics: metrics.collector,
		});

		writeFileSync(lockPath, `${process.pid}\n${Date.now()}\nlive-holder`);
		await expect(
			withFileMutex(target, async () => undefined, {
				onContention: 'fail',
				timeoutMs: 50,
				staleMs: 30_000,
				pollMs: 10,
				metrics: metrics.collector,
			}),
		).rejects.toBeInstanceOf(LockContentionError);

		const snapshot = metrics.snapshot();
		expect(snapshot.contentionCount).toBe(2);
		expect(snapshot.staleReclaims).toBe(1);
		expect(snapshot.failedAcquisitions).toBe(1);
		expect(snapshot.waitMs).toBeGreaterThanOrEqual(0);
		expect(JSON.stringify(snapshot)).not.toContain(target);
		expect(JSON.stringify(snapshot)).not.toContain(lockPath);
	});
});
