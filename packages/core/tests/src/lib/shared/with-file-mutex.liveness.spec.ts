import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	__resetWithFileMutexTestHooks,
	__setWithFileMutexTestHooks,
	classifyHolderLiveness,
	LockContentionError,
	withFileMutex,
} from '../../../../src/lib/shared/with-file-mutex';

/**
 * x00420 — a silent heartbeat is not proof of death.
 *
 * `setInterval` does not fire while the event loop is busy, and the
 * critical section is exactly where the holder does its heavy work. A
 * reclaimer that trusts the timer alone steals the lock from a live
 * holder and puts two writers inside the section the mutex exists to
 * serialise — silently, with no error raised anywhere.
 */
describe('withFileMutex holder liveness (x00420)', () => {
	describe('classifyHolderLiveness', () => {
		const alwaysAlive = () => true;
		const alwaysDead = () => false;

		it('a live pid on this host is alive', () => {
			expect(
				classifyHolderLiveness(
					{ host: 'box', pid: 42 },
					'box',
					alwaysAlive,
				),
			).toBe('alive');
		});

		it('a vanished pid on this host is dead', () => {
			expect(
				classifyHolderLiveness(
					{ host: 'box', pid: 42 },
					'box',
					alwaysDead,
				),
			).toBe('dead');
		});

		it('a pid from another host is unknown, never dead', () => {
			// The sidecar may sit on a shared volume. That pid either
			// collides with an unrelated local process or looks absent,
			// and reading "absent" as "dead" would license stealing a
			// perfectly live holder on the other machine.
			expect(
				classifyHolderLiveness(
					{ host: 'other-box', pid: 42 },
					'box',
					alwaysDead,
				),
			).toBe('unknown');
		});

		it('a lease with no identity is unknown', () => {
			expect(classifyHolderLiveness({}, 'box', alwaysDead)).toBe(
				'unknown',
			);
			expect(
				classifyHolderLiveness({ host: 'box' }, 'box', alwaysDead),
			).toBe('unknown');
			expect(classifyHolderLiveness({ pid: 42 }, 'box', alwaysDead)).toBe(
				'unknown',
			);
		});

		it('never consults the probe for a lease it cannot judge', () => {
			let consulted = false;
			classifyHolderLiveness({ host: 'other', pid: 1 }, 'box', () => {
				consulted = true;
				return false;
			});
			expect(consulted).toBe(false);
		});
	});

	describe('reclaim decision', () => {
		let dir: string;
		let target: string;
		let lockPath: string;

		beforeEach(() => {
			dir = mkdtempSync(join(tmpdir(), 'mutex-liveness-'));
			target = join(dir, 'state.json');
			lockPath = `${target}.mutex`;
		});

		afterEach(() => {
			__resetWithFileMutexTestHooks();
			rmSync(dir, { recursive: true, force: true });
		});

		/** A lease that expired long ago, as a frozen holder would leave it. */
		const writeExpiredLease = (holder: {
			host?: string;
			pid?: number;
		}): void => {
			writeFileSync(
				lockPath,
				JSON.stringify({
					acquiredAt: Date.now() - 60_000,
					generation: 3,
					heartbeatAt: Date.now() - 60_000,
					token: 'someone-else',
					...holder,
				}),
			);
		};

		it('a live holder keeps its lock even after the heartbeat goes silent', async () => {
			writeExpiredLease({ host: hostname(), pid: 4242 });
			__setWithFileMutexTestHooks({ isPidAlive: () => true });

			// The waiter must NOT reclaim. It gives up on the contention
			// budget instead, which is the caller's signal to back off.
			await expect(
				withFileMutex(target, async () => 'stolen', {
					staleMs: 10,
					timeoutMs: 120,
					pollMs: 10,
					onContention: 'fail',
				}),
			).rejects.toBeInstanceOf(LockContentionError);
		});

		it('a holder whose process is gone loses the lock', async () => {
			writeExpiredLease({ host: hostname(), pid: 4242 });
			__setWithFileMutexTestHooks({ isPidAlive: () => false });

			await expect(
				withFileMutex(target, async () => 'reclaimed', {
					staleMs: 10,
					timeoutMs: 2_000,
					pollMs: 10,
				}),
			).resolves.toBe('reclaimed');
		});

		it('a lease from another host still falls back to the heartbeat rule', async () => {
			// Not judgeable, so the old behaviour stands: expired means
			// reclaimable. What must NOT happen is the probe deciding it.
			writeExpiredLease({ host: `${hostname()}-elsewhere`, pid: 4242 });
			__setWithFileMutexTestHooks({
				isPidAlive: () => {
					throw new Error('probe must not run for a foreign host');
				},
			});

			await expect(
				withFileMutex(target, async () => 'reclaimed', {
					staleMs: 10,
					timeoutMs: 2_000,
					pollMs: 10,
				}),
			).resolves.toBe('reclaimed');
		});

		it('a legacy lease with no identity still falls back to the heartbeat rule', async () => {
			writeExpiredLease({});
			__setWithFileMutexTestHooks({
				isPidAlive: () => {
					throw new Error('probe must not run without an identity');
				},
			});

			await expect(
				withFileMutex(target, async () => 'reclaimed', {
					staleMs: 10,
					timeoutMs: 2_000,
					pollMs: 10,
				}),
			).resolves.toBe('reclaimed');
		});

		it('recovering from a dead holder is not slower than before', async () => {
			writeExpiredLease({ host: hostname(), pid: 4242 });
			__setWithFileMutexTestHooks({ isPidAlive: () => false });

			const startedAt = Date.now();
			await withFileMutex(target, async () => undefined, {
				staleMs: 10,
				timeoutMs: 2_000,
				pollMs: 10,
			});

			// The grace sleep is skipped for a holder that cannot come
			// back, so reclaim is prompt rather than waiting it out.
			expect(Date.now() - startedAt).toBeLessThan(200);
		});

		it('stamps its own host and pid into the lease it holds', async () => {
			// Without this the whole mechanism is inert: a reclaimer can
			// only ask whether a holder is alive if the holder said who
			// it is.
			let lease: { host?: string; pid?: number } | undefined;
			await withFileMutex(target, async () => {
				lease = JSON.parse(readFileSync(lockPath, 'utf8')) as {
					host?: string;
					pid?: number;
				};
			});

			expect(lease?.host).toBe(hostname());
			expect(lease?.pid).toBe(process.pid);
		});
	});
});
