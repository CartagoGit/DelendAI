/**
 * with-file-mutex.uncovered-paths.spec.ts
 *
 * Fills coverage gaps in `with-file-mutex.ts` that the existing specs
 * (reclaim, release-race, liveness, race, property, errno) do not reach:
 * reentrance, the real `isPidAlive` probe, a non-object lease payload, the
 * `onContention: 'steal'` timeout path, a lock vanishing inside the
 * reclaim grace window, `restoreReclaimPath`'s own success path, the
 * commit-step failure unwind (`removeIfOwned` + `restoreReclaimPath`'s
 * ENOENT branch), and `removeDisplacedLease`.
 *
 * These are all driven through the public `withFileMutex` API plus its
 * documented test hooks and real filesystem arrangements — no internals
 * are exported for the sake of testing.
 */
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IMutexMetricsCollector } from '../../../../src/lib/contracts/interfaces/mutex-metrics.interface';
import {
	__resetWithFileMutexTestHooks,
	__setWithFileMutexTestHooks,
	LockContentionError,
	withFileMutex,
} from '../../../../src/lib/shared/with-file-mutex';

interface IStructuredLease {
	readonly acquiredAt: number;
	readonly generation: number;
	readonly heartbeatAt: number;
	readonly token: string;
	readonly host?: string;
	readonly pid?: number;
}

const writeStructuredLease = (path: string, lease: IStructuredLease): void => {
	writeFileSync(path, JSON.stringify(lease));
};

describe('withFileMutex — remaining public-API paths', () => {
	let dir = '';
	let target = '';
	let lockPath = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mutex-uncovered-'));
		target = join(dir, 'state.json');
		lockPath = `${target}.mutex`;
	});

	afterEach(() => {
		__resetWithFileMutexTestHooks();
		rmSync(dir, { recursive: true, force: true });
	});

	it('lets a nested call for an already-held lock skip the filesystem mutex', async () => {
		const order: string[] = [];
		const result = await withFileMutex(target, async () => {
			order.push('outer-enter');
			const inner = await withFileMutex(target, async () => {
				order.push('inner');
				return 'inner-result';
			});
			order.push('outer-exit');
			return inner;
		});

		expect(result).toBe('inner-result');
		expect(order).toEqual(['outer-enter', 'inner', 'outer-exit']);
		expect(existsSync(lockPath)).toBe(false);
	});

	describe('the real process-liveness probe', () => {
		it('treats its own pid as alive and refuses to steal a heartbeat-silent lock', async () => {
			writeStructuredLease(lockPath, {
				acquiredAt: Date.now() - 60_000,
				generation: 3,
				heartbeatAt: Date.now() - 60_000,
				token: 'someone-else',
				host: hostname(),
				pid: process.pid,
			});

			let entered = false;
			await expect(
				withFileMutex(
					target,
					async () => {
						entered = true;
					},
					{
						onContention: 'fail',
						staleMs: 10,
						timeoutMs: 80,
						pollMs: 10,
					},
				),
			).rejects.toBeInstanceOf(LockContentionError);

			expect(entered).toBe(false);
		});

		it('treats a pid with no matching process as dead and reclaims', async () => {
			writeStructuredLease(lockPath, {
				acquiredAt: Date.now() - 60_000,
				generation: 3,
				heartbeatAt: Date.now() - 60_000,
				token: 'someone-else',
				host: hostname(),
				// Far beyond any real pid range: the kernel reports ESRCH,
				// not EPERM, so the real probe must classify this as dead.
				pid: 999_999_999,
			});

			let entered = false;
			await withFileMutex(
				target,
				async () => {
					entered = true;
				},
				{ staleMs: 10, timeoutMs: 2_000, pollMs: 10 },
			);

			expect(entered).toBe(true);
		});
	});

	it('falls back to the raw-token rule when the sidecar parses to a non-object JSON value', async () => {
		// Valid JSON, but not a lease payload: `isLockLeasePayload` must
		// reject it on shape, not on a JSON.parse failure.
		writeFileSync(lockPath, 'null');
		const old = new Date(Date.now() - 60_000);
		utimesSync(lockPath, old, old);

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
			},
			{ staleMs: 20, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
	});

	it('steals a live lock past the deadline when onContention is "steal"', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now(),
			generation: 0,
			heartbeatAt: Date.now(),
			token: 'live-elsewhere',
		});

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
			},
			{
				onContention: 'steal',
				timeoutMs: 40,
				staleMs: 60_000,
				pollMs: 5,
			},
		);

		expect(entered).toBe(true);
		expect(existsSync(lockPath)).toBe(false);
	});

	it('retries cleanly when the lock vanishes during the reclaim grace window', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 1,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});

		let observed = 0;
		__setWithFileMutexTestHooks({
			afterObserveStale: () => {
				observed += 1;
				if (observed === 1) {
					// The original holder finishes and releases normally
					// inside the grace window we are about to sleep through.
					rmSync(lockPath, { force: true });
				}
			},
		});

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
			},
			{ staleMs: 50, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
		expect(observed).toBeGreaterThanOrEqual(1);
	});

	it('restores its reclaim copy when the recheck turns out to be a false positive', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 4,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});

		__setWithFileMutexTestHooks({
			afterReclaimRename: ({ reclaimPath }) => {
				// Something touched our displaced copy before we could read
				// it back: the revalidation must see a mismatch.
				writeStructuredLease(reclaimPath, {
					acquiredAt: Date.now(),
					generation: 999,
					heartbeatAt: Date.now(),
					token: 'someone-else',
				});
			},
		});

		await expect(
			withFileMutex(target, async () => 'stolen', {
				onContention: 'fail',
				staleMs: 20,
				timeoutMs: 150,
				pollMs: 10,
			}),
		).rejects.toBeInstanceOf(LockContentionError);

		// Restored, not orphaned: the lease is back at the canonical path.
		expect(existsSync(lockPath)).toBe(true);
		const restored = JSON.parse(
			readFileSync(lockPath, 'utf8'),
		) as IStructuredLease;
		expect(restored.token).toBe('someone-else');
		const leftovers = readdirSync(dir).filter((name) =>
			name.includes('.reclaim.'),
		);
		expect(leftovers).toEqual([]);
	});

	it('unwinds cleanly when the commit step itself fails after a successful steal', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 2,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});

		const explosive: IMutexMetricsCollector = {
			recordWaitMs: () => undefined,
			recordContention: () => undefined,
			recordFailedAcquisition: () => undefined,
			recordStaleReclaim: () => {
				throw new Error('metrics sink is down');
			},
		};

		let entered = false;
		await expect(
			withFileMutex(
				target,
				async () => {
					entered = true;
				},
				{ staleMs: 20, timeoutMs: 500, pollMs: 10, metrics: explosive },
			),
		).rejects.toThrow('metrics sink is down');

		expect(entered).toBe(false);
		// The steal was correctly unwound: no lock left behind and the
		// reclaim copy was not orphaned.
		expect(existsSync(lockPath)).toBe(false);
		const leftovers = readdirSync(dir).filter((name) =>
			name.includes('.reclaim.'),
		);
		expect(leftovers).toEqual([]);
	});

	it('removes its own lease from a displaced reclaim copy at release', async () => {
		// Simulates the rare window a reclaimer creates: this holder's lock
		// gets renamed out from under it while its critical section runs,
		// carrying the SAME token, so release must find and remove it via
		// the displaced-copy path rather than the direct one.
		let displacedPath: string | undefined;
		await withFileMutex(
			target,
			async () => {
				displacedPath = `${lockPath}.reclaim.${String(process.pid)}.${randomUUID()}`;
				renameSync(lockPath, displacedPath);
			},
			{ staleMs: 60_000, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(displacedPath).toBeDefined();
		expect(existsSync(lockPath)).toBe(false);
		if (displacedPath !== undefined) {
			expect(existsSync(displacedPath)).toBe(false);
		}
	});
});
