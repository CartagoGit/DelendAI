import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	__resetWithFileMutexTestHooks,
	__setWithFileMutexTestHooks,
	LockContentionError,
	withFileMutex,
} from '../../../../src/lib/shared/with-file-mutex';

const delay = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (
	predicate: () => boolean,
	timeoutMs = 400,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) {
			throw new Error('timed out waiting for test condition');
		}
		await delay(5);
	}
};

describe('withFileMutex state-machine invariants', () => {
	let dir = '';
	let target = '';
	let lockPath = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mutex-property-'));
		target = join(dir, 'state.json');
		lockPath = `${target}.mutex`;
		writeFileSync(target, '{}');
	});

	afterEach(() => {
		__resetWithFileMutexTestHooks();
		rmSync(dir, { recursive: true, force: true });
	});

	it('[<200ms] reclaims both legacy and structured stale sidecars across bounded ages', async () => {
		const cases = [
			{ format: 'legacy', staleMs: 20, ageMs: 60 },
			{ format: 'legacy', staleMs: 40, ageMs: 120 },
			{ format: 'structured', staleMs: 20, ageMs: 60 },
			{ format: 'structured', staleMs: 40, ageMs: 120 },
		] as const;

		for (const [caseIndex, entry] of cases.entries()) {
			const observedAt = Date.now() - entry.ageMs;
			if (entry.format === 'legacy') {
				writeFileSync(
					lockPath,
					`${process.pid}\n${observedAt}\nlegacy-${caseIndex}`,
				);
				const old = new Date(observedAt);
				utimesSync(lockPath, old, old);
			} else {
				writeFileSync(
					lockPath,
					JSON.stringify({
						acquiredAt: observedAt,
						generation: 3,
						heartbeatAt: observedAt,
						token: `structured-${caseIndex}`,
					}),
				);
			}

			let entered = false;
			await withFileMutex(
				target,
				async () => {
					entered = true;
				},
				{
					pollMs: 2,
					staleMs: entry.staleMs,
					timeoutMs: 200,
				},
			);

			expect(entered, `case ${caseIndex}`).toBe(true);
			expect(existsSync(lockPath), `case ${caseIndex}`).toBe(false);
		}
	});

	it('[<200ms] heartbeats keep the lock live across long critical sections', async () => {
		// The lease windows must stay well clear of scheduler jitter. With a
		// 40ms stale window a heartbeat that is merely descheduled — not
		// dead — reads as expired, the waiter reclaims, and the assertion
		// below fails for a reason that has nothing to do with heartbeats.
		// These ratios are what the test is really about: heartbeatMs well
		// under staleMs, and a holder that outlives the whole stale window.
		const cases = [
			{ heartbeatMs: 20, staleMs: 400 },
			{ heartbeatMs: 30, staleMs: 600 },
			{ heartbeatMs: 40, staleMs: 800 },
		] as const;

		// Fake clock: the heartbeat is a setInterval, so its count is a pure
		// function of how far the clock is advanced. Only timers and Date are
		// faked; the lock file I/O stays real, so after each advance the test
		// yields to the real event loop until that heartbeat's write settled.
		const settle = async (
			predicate: () => boolean,
			maxYields = 10_000,
		): Promise<void> => {
			for (let i = 0; i < maxYields && !predicate(); i += 1) {
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
		};

		const fsDrained = (): boolean =>
			!process
				.getActiveResourcesInfo()
				.some(
					(name) => name.endsWith('Req') || name.startsWith('FSReq'),
				);
		vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
		try {
			for (const [caseIndex, entry] of cases.entries()) {
				let heartbeatCount = 0;
				let waiterEntered = false;
				const targetCase = join(
					dir,
					`state-heartbeat-${caseIndex}.json`,
				);
				const lockPathCase = `${targetCase}.mutex`;
				writeFileSync(targetCase, '{}');
				const holderDurationMs = Math.max(
					entry.heartbeatMs * 8,
					entry.staleMs + 20,
				);

				__setWithFileMutexTestHooks({
					// A live holder whose heartbeats keep the lease fresh:
					// reclaim must keep seeing the pid as alive.
					isPidAlive: () => true,
					afterHeartbeat: () => {
						heartbeatCount += 1;
					},
				});

				const armedBaseline = vi.getTimerCount();
				const holder = withFileMutex(
					targetCase,
					async () => {
						await delay(holderDurationMs);
					},
					{
						heartbeatMs: entry.heartbeatMs,
						pollMs: 2,
						staleMs: entry.staleMs,
						timeoutMs: 2000,
					},
				);

				// Holder delay + heartbeat interval both armed.
				await settle(
					() =>
						existsSync(lockPathCase) &&
						vi.getTimerCount() >= armedBaseline + 2,
				);
				expect(existsSync(lockPathCase), `case ${caseIndex}`).toBe(
					true,
				);

				// Advance past the whole stale window, one heartbeat at a time.
				let elapsedMs = 0;
				let expectedHeartbeats = 0;
				while (elapsedMs < entry.staleMs) {
					await vi.advanceTimersByTimeAsync(entry.heartbeatMs);
					elapsedMs += entry.heartbeatMs;
					expectedHeartbeats += 1;
					await settle(() => heartbeatCount >= expectedHeartbeats);
					// afterHeartbeat fires before the handle is closed and the
					// in-flight guard released; a tick landing in that window
					// is skipped, so wait for the fs requests to drain.
					await settle(fsDrained);
					expect(heartbeatCount, `case ${caseIndex}`).toBe(
						expectedHeartbeats,
					);
				}
				// One more millisecond: strictly past the stale window, still
				// before the holder's section (and next heartbeat) ends.
				await vi.advanceTimersByTimeAsync(1);
				elapsedMs += 1;
				expect(elapsedMs, `case ${caseIndex}`).toBeGreaterThan(
					entry.staleMs,
				);

				// The waiter's poll sleeps are fake too: advance in poll-sized
				// steps until it gives up. Its 5ms budget ends before the
				// holder's section and the next heartbeat.
				const holderTimers = vi.getTimerCount();
				const waiterOutcome = withFileMutex(
					targetCase,
					async () => {
						waiterEntered = true;
					},
					{
						onContention: 'fail',
						heartbeatMs: entry.heartbeatMs,
						pollMs: 2,
						staleMs: entry.staleMs,
						timeoutMs: 5,
					},
				).then(
					() => undefined,
					(error: unknown) => error,
				);
				let waiterDone = false;
				void waiterOutcome.then(() => {
					waiterDone = true;
				});
				for (let step = 0; step < 10 && !waiterDone; step += 1) {
					// Real fs round trips happen between two fake sleeps: wait
					// until the waiter is parked on its next one (or is done).
					await settle(
						() => waiterDone || vi.getTimerCount() > holderTimers,
					);
					if (waiterDone) break;
					await vi.advanceTimersByTimeAsync(2);
					elapsedMs += 2;
				}
				expect(await waiterOutcome, `case ${caseIndex}`).toBeInstanceOf(
					LockContentionError,
				);

				expect(waiterEntered, `case ${caseIndex}`).toBe(false);
				expect(heartbeatCount, `case ${caseIndex}`).toBe(
					expectedHeartbeats,
				);

				expect(elapsedMs, `case ${caseIndex}`).toBeLessThan(
					holderDurationMs,
				);
				await vi.advanceTimersByTimeAsync(holderDurationMs - elapsedMs);
				await holder;
				// A tick that fired at the instant the section ended may still be
				// finishing; it must not count toward the next case.
				await settle(fsDrained);
				__resetWithFileMutexTestHooks();
			}
		} finally {
			__resetWithFileMutexTestHooks();
			vi.useRealTimers();
		}
	});

	it('[<200ms] heartbeat generations are monotonic across bounded runs', async () => {
		const cases = [3, 4, 5] as const;

		for (const [caseIndex, targetHeartbeats] of cases.entries()) {
			const generations: number[] = [];
			let caseToken: string | undefined;
			const targetCase = join(dir, `state-generation-${caseIndex}.json`);
			writeFileSync(targetCase, '{}');

			__setWithFileMutexTestHooks({
				// x00420: an aged lease alone no longer means "abandoned" —
				// the reclaimer also asks whether the holder's process is
				// still running, and in a single-process test that pid is
				// ours, so a real holder would look alive forever. A holder
				// that is genuinely abandoned is one whose process is gone,
				// which is what this probe states.
				isPidAlive: () => false,
				afterHeartbeat: (lease) => {
					if (lease.token !== caseToken) return;
					generations.push(lease.generation);
				},
			});

			// Hold the lock until the heartbeats have actually been observed
			// rather than for a wall-clock window sized as heartbeatMs * N:
			// under load the timer fires fewer times than the division
			// predicts, which made this assertion flaky.
			await withFileMutex(
				targetCase,
				async () => {
					caseToken = (
						JSON.parse(
							readFileSync(`${targetCase}.mutex`, 'utf8'),
						) as { token?: unknown }
					).token as string;
					await waitFor(
						() => generations.length >= targetHeartbeats,
						15_000,
					);
				},
				{
					heartbeatMs: 5,
					pollMs: 2,
					staleMs: 30_000,
					timeoutMs: 30_000,
				},
			);

			expect(
				generations.length,
				`case ${caseIndex}`,
			).toBeGreaterThanOrEqual(targetHeartbeats);
			for (let index = 1; index < generations.length; index += 1) {
				const current = generations[index];
				const previous = generations[index - 1];
				if (current === undefined || previous === undefined) {
					throw new Error(
						`missing generation sample for case ${caseIndex}`,
					);
				}
				expect(
					current,
					`case ${caseIndex} generation ${index}`,
				).toBeGreaterThan(previous);
			}
			__resetWithFileMutexTestHooks();
		}
	});
});
