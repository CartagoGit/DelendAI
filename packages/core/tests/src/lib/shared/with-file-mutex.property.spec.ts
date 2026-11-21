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

// The heartbeat is a setInterval, so under a fake clock its count is a pure
// function of how far the test advances. Only timers and Date are faked; the
// lock file I/O stays real, so after each advance the test yields to the real
// event loop until that heartbeat's fs work has settled.
// The real monotonic clock, kept before fake timers replace performance.now:
// the heartbeat give-up below is a real-time bound, not a fake-time one.
const realNowMs = performance.now.bind(performance);

const settle = async (
	predicate: () => boolean,
	maxYields = 10_000,
): Promise<void> => {
	for (let i = 0; i < maxYields && !predicate(); i += 1) {
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
};

interface IHeartbeatTicks {
	/** Heartbeats that read the lease and are about to write it. */
	started: number;
	/** Heartbeats whose write finished. */
	done: number;
}

type TestHooks = Parameters<typeof __setWithFileMutexTestHooks>[0];

/** Hook pair that counts heartbeat ticks as they start and as they finish. */
const trackHeartbeats = (
	onDone: (generation: number) => void = () => undefined,
): { ticks: IHeartbeatTicks; hooks: TestHooks } => {
	const ticks: IHeartbeatTicks = { started: 0, done: 0 };
	return {
		ticks,
		hooks: {
			beforeHeartbeatWrite: () => {
				ticks.started += 1;
			},
			afterHeartbeat: (lease) => {
				ticks.done += 1;
				onDone(lease.generation);
			},
		},
	};
};

/**
 * Advance the fake clock one heartbeat period at a time until one more
 * heartbeat has finished; returns the fake milliseconds spent.
 *
 * The mutex skips a tick while the previous heartbeat is still in flight
 * (its handle is closed after `afterHeartbeat`), and a skipped tick reports
 * nothing: then the clock simply advances another period. A tick that has
 * started is waited for however long its real fs work takes, and cannot be
 * doubled, because the in-flight guard is taken when it starts.
 */
const advanceToNextHeartbeat = async (
	periodMs: number,
	ticks: IHeartbeatTicks,
): Promise<number> => {
	const before = ticks.done;
	let spentMs = 0;
	for (let attempt = 0; attempt < 100; attempt += 1) {
		await vi.advanceTimersByTimeAsync(periodMs);
		spentMs += periodMs;
		const giveUpAt = realNowMs() + 20;
		while (ticks.done === before) {
			if (ticks.started === before && realNowMs() > giveUpAt) {
				break;
			}
			await new Promise<void>((resolve) => setImmediate(resolve));
		}
		if (ticks.done > before) {
			expect(ticks.done, 'one heartbeat per matched period').toBe(
				before + 1,
			);
			return spentMs;
		}
	}
	throw new Error('no heartbeat was reported');
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

		vi.useFakeTimers({
			toFake: ['setTimeout', 'setInterval', 'Date', 'performance'],
		});
		try {
			for (const [caseIndex, entry] of cases.entries()) {
				const tracker = trackHeartbeats();
				let waiterEntered = false;
				const targetCase = join(
					dir,
					`state-heartbeat-${caseIndex}.json`,
				);
				const lockPathCase = `${targetCase}.mutex`;
				writeFileSync(targetCase, '{}');
				__setWithFileMutexTestHooks({
					// A live holder whose heartbeats keep the lease fresh:
					// reclaim must keep seeing the pid as alive.
					isPidAlive: () => true,
					...tracker.hooks,
				});

				const armedBaseline = vi.getTimerCount();
				let endSection: () => void = () => undefined;
				const sectionGate = new Promise<void>((resolve) => {
					endSection = resolve;
				});
				const holder = withFileMutex(
					targetCase,
					async () => {
						await sectionGate;
					},
					{
						heartbeatMs: entry.heartbeatMs,
						pollMs: 2,
						staleMs: entry.staleMs,
						timeoutMs: 2000,
					},
				);

				// The heartbeat interval is armed.
				await settle(
					() =>
						existsSync(lockPathCase) &&
						vi.getTimerCount() >= armedBaseline + 1,
				);
				expect(existsSync(lockPathCase), `case ${caseIndex}`).toBe(
					true,
				);

				// Advance past the whole stale window, one heartbeat at a time.
				let elapsedMs = 0;
				let expectedHeartbeats = 0;
				while (elapsedMs < entry.staleMs) {
					elapsedMs += await advanceToNextHeartbeat(
						entry.heartbeatMs,
						tracker.ticks,
					);
					expectedHeartbeats += 1;
					expect(tracker.ticks.done, `case ${caseIndex}`).toBe(
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
				expect(tracker.ticks.done, `case ${caseIndex}`).toBe(
					expectedHeartbeats,
				);

				endSection();
				await holder;
				__resetWithFileMutexTestHooks();
			}
		} finally {
			__resetWithFileMutexTestHooks();
			vi.useRealTimers();
		}
	});

	it('[<200ms] heartbeat generations are monotonic across bounded runs', async () => {
		const cases = [3, 4, 5] as const;

		vi.useFakeTimers({
			toFake: ['setTimeout', 'setInterval', 'Date', 'performance'],
		});
		try {
			for (const [caseIndex, targetHeartbeats] of cases.entries()) {
				const generations: number[] = [];
				const tracker = trackHeartbeats((generation) => {
					generations.push(generation);
				});
				let caseToken: string | undefined;
				let release: () => void = () => undefined;
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				const targetCase = join(
					dir,
					`state-generation-${caseIndex}.json`,
				);
				writeFileSync(targetCase, '{}');

				__setWithFileMutexTestHooks({
					// x00420: an aged lease alone no longer means "abandoned" —
					// the reclaimer also asks whether the holder's process is
					// still running, and in a single-process test that pid is
					// ours, so a real holder would look alive forever. A holder
					// that is genuinely abandoned is one whose process is gone,
					// which is what this probe states.
					isPidAlive: () => false,
					...tracker.hooks,
				});

				// The section holds until the test has advanced the clock
				// through the target number of heartbeats, then releases it.
				const armedBaseline = vi.getTimerCount();
				const holder = withFileMutex(
					targetCase,
					async () => {
						caseToken = (
							JSON.parse(
								readFileSync(`${targetCase}.mutex`, 'utf8'),
							) as { token?: unknown }
						).token as string;
						await gate;
					},
					{
						heartbeatMs: 5,
						pollMs: 2,
						staleMs: 30_000,
						timeoutMs: 30_000,
					},
				);
				await settle(
					() =>
						caseToken !== undefined &&
						vi.getTimerCount() > armedBaseline,
				);

				for (let beat = 1; beat <= targetHeartbeats; beat += 1) {
					await advanceToNextHeartbeat(5, tracker.ticks);
					expect(generations.length, `case ${caseIndex}`).toBe(beat);
				}

				release();
				await holder;

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
		} finally {
			__resetWithFileMutexTestHooks();
			vi.useRealTimers();
		}
	});
});
