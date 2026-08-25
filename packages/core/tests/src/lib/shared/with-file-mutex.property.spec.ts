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

	it('enumerated contender schedules never allow two simultaneous holders', async () => {
		const scenarios = [
			{
				startDelays: [0, 1, 2],
				sectionDurations: [12, 6, 0],
				crashIndex: -1,
			},
			{
				startDelays: [0, 0, 0],
				sectionDurations: [8, 8, 8],
				crashIndex: -1,
			},
			{
				startDelays: [0, 2, 4],
				sectionDurations: [20, 0, 3],
				crashIndex: 1,
			},
			{
				startDelays: [0, 3, 3],
				sectionDurations: [5, 15, 5],
				crashIndex: 2,
			},
			{
				startDelays: [1, 1, 2],
				sectionDurations: [10, 10, 1],
				crashIndex: 0,
			},
			{
				startDelays: [0, 5, 10],
				sectionDurations: [18, 4, 4],
				crashIndex: -1,
			},
		] as const;

		for (const [scenarioIndex, scenario] of scenarios.entries()) {
			let insideCount = 0;
			let maxConcurrent = 0;

			const contenders = scenario.startDelays.map(
				(startDelay, contenderIndex) =>
					(async () => {
						const sectionDuration =
							scenario.sectionDurations[contenderIndex] ?? 0;
						await delay(startDelay);
						await withFileMutex(
							target,
							async () => {
								insideCount += 1;
								maxConcurrent = Math.max(
									maxConcurrent,
									insideCount,
								);
								await delay(sectionDuration);
								insideCount -= 1;
								if (scenario.crashIndex === contenderIndex) {
									throw new Error(
										`simulated-crash-${scenarioIndex}-${contenderIndex}`,
									);
								}
							},
							{
								// These scenarios exercise contention, overlap
								// and crash-release — not stale reclaim, which
								// has its own test below. An 80ms stale window
								// against ≤20ms sections left no margin on a
								// loaded machine: a descheduled-but-live holder
								// got reclaimed, and the restored reclaim marker
								// then outlived its release, leaving the sidecar
								// behind. Widen the window so only genuine
								// contention is under test here.
								heartbeatMs: 10,
								pollMs: 2,
								staleMs: 800,
								timeoutMs: 2000,
							},
						);
					})().catch(() => undefined),
			);

			await Promise.all(contenders);
			expect(
				maxConcurrent,
				`scenario ${scenarioIndex}`,
			).toBeLessThanOrEqual(1);
			expect(existsSync(lockPath), `scenario ${scenarioIndex}`).toBe(
				false,
			);
		}
	});

	it('reclaims both legacy and structured stale sidecars across bounded ages', async () => {
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

	it('heartbeats keep the lock live across long critical sections', async () => {
		const cases = [
			{ heartbeatMs: 5, staleMs: 40 },
			{ heartbeatMs: 10, staleMs: 80 },
			{ heartbeatMs: 15, staleMs: 100 },
		] as const;

		for (const [caseIndex, entry] of cases.entries()) {
			let heartbeatCount = 0;
			let waiterEntered = false;
			const targetCase = join(dir, `state-heartbeat-${caseIndex}.json`);
			const lockPathCase = `${targetCase}.mutex`;
			writeFileSync(targetCase, '{}');
			const holderDurationMs = Math.max(
				entry.heartbeatMs * 8,
				entry.staleMs + 20,
			);
			const waiterTimeoutMs = Math.max(15, entry.heartbeatMs * 3);

			__setWithFileMutexTestHooks({
				afterHeartbeat: () => {
					heartbeatCount += 1;
				},
			});

			const holder = withFileMutex(
				targetCase,
				async () => {
					await delay(holderDurationMs);
				},
				{
					heartbeatMs: entry.heartbeatMs,
					pollMs: 2,
					staleMs: entry.staleMs,
					timeoutMs: 250,
				},
			);

			await waitFor(() => existsSync(lockPathCase));
			await waitFor(() => heartbeatCount >= 2, entry.heartbeatMs * 20);

			await expect(
				withFileMutex(
					targetCase,
					async () => {
						waiterEntered = true;
					},
					{
						onContention: 'fail',
						heartbeatMs: entry.heartbeatMs,
						pollMs: 2,
						staleMs: entry.staleMs,
						timeoutMs: waiterTimeoutMs,
					},
				),
			).rejects.toBeInstanceOf(LockContentionError);

			expect(waiterEntered, `case ${caseIndex}`).toBe(false);
			expect(heartbeatCount, `case ${caseIndex}`).toBeGreaterThanOrEqual(
				2,
			);

			await holder;
			__resetWithFileMutexTestHooks();
		}
	});

	it('heartbeat generations are monotonic across bounded runs', async () => {
		const cases = [3, 4, 5] as const;
		// A heartbeat already in flight when the lock is released still
		// resolves (harmlessly) after `withFileMutex` returns, and the test
		// hook is process-global — so without this, a leftover sample from an
		// earlier case lands in the next case's samples and looks like a
		// generation going backwards. Retiring each case's token makes the
		// attribution exact instead of timing-dependent.
		const retiredTokens = new Set<string>();

		for (const [caseIndex, targetHeartbeats] of cases.entries()) {
			const generations: number[] = [];
			const caseTokens = new Set<string>();
			const targetCase = join(dir, `state-generation-${caseIndex}.json`);
			writeFileSync(targetCase, '{}');

			__setWithFileMutexTestHooks({
				afterHeartbeat: (lease) => {
					if (retiredTokens.has(lease.token)) return;
					caseTokens.add(lease.token);
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

			// Let any heartbeat still in flight at release land here, where it
			// belongs, before this case's tokens are retired.
			await delay(20);
			for (const caseToken of caseTokens) retiredTokens.add(caseToken);

			expect(
				generations.length,
				`case ${caseIndex}`,
			).toBeGreaterThanOrEqual(targetHeartbeats);
			expect(caseTokens.size, `case ${caseIndex}`).toBe(1);
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
