import {
	existsSync,
	mkdtempSync,
	rmSync,
	readFileSync,
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

interface IStructuredLease {
	readonly acquiredAt: number;
	readonly generation: number;
	readonly heartbeatAt: number;
	readonly token: string;
}

const readStructuredLease = (path: string): IStructuredLease =>
	JSON.parse(readFileSync(path, 'utf8')) as IStructuredLease;

const writeStructuredLease = (path: string, lease: IStructuredLease): void => {
	writeFileSync(path, JSON.stringify(lease));
};

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
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 3,
			heartbeatAt: Date.now() - 60_000,
			token: 'live-holder',
		});

		let entered = false;
		let observedCount = 0;
		__setWithFileMutexTestHooks({
			afterObserveStale: async () => {
				observedCount += 1;
				const current = readStructuredLease(lockPath);
				writeStructuredLease(lockPath, {
					...current,
					generation: current.generation + 1,
					heartbeatAt: Date.now(),
				});
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
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 7,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});

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

		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 2,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});

		await withFileMutex(target, async () => undefined, {
			timeoutMs: 100,
			staleMs: 1_000,
			pollMs: 10,
			metrics: metrics.collector,
		});

		writeStructuredLease(lockPath, {
			acquiredAt: Date.now(),
			generation: 4,
			heartbeatAt: Date.now(),
			token: 'live-holder',
		});
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
