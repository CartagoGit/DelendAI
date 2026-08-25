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

describe('withFileMutex race window (MUT2-001)', () => {
	let dir = '';
	let target = '';
	let lockPath = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mutex-race-'));
		target = join(dir, 'state.json');
		lockPath = `${target}.mutex`;
		writeFileSync(target, '{}');
	});

	afterEach(() => {
		__resetWithFileMutexTestHooks();
		rmSync(dir, { recursive: true, force: true });
	});

	it('does not open a third-contender window when a holder heartbeats after stale observation', async () => {
		let releaseHolder: () => void = () => undefined;
		const holderReleased = new Promise<void>((resolve) => {
			releaseHolder = resolve;
		});
		let releaseContender: () => void = () => undefined;
		const contenderReleased = new Promise<void>((resolve) => {
			releaseContender = resolve;
		});
		let contenderEnteredResolve: () => void = () => undefined;
		const contenderEntered = new Promise<void>((resolve) => {
			contenderEnteredResolve = resolve;
		});

		let holderInside = false;
		let contenderObservedOverlap = false;
		let contenderStarted = false;
		let contenderPromise: Promise<void> | undefined;

		const holder = withFileMutex(
			target,
			async () => {
				holderInside = true;
				await holderReleased;
				holderInside = false;
			},
			{ heartbeatMs: 5_000, staleMs: 1_000, pollMs: 5 },
		);

		while (!existsSync(lockPath)) {
			await new Promise((resolve) => setTimeout(resolve, 5));
		}

		const staleTime = new Date(Date.now() - 60_000);
		utimesSync(lockPath, staleTime, staleTime);

		__setWithFileMutexTestHooks({
			afterObserveStale: () => {
				const now = new Date();
				utimesSync(lockPath, now, now);
			},
			afterReclaimRename: async () => {
				if (!contenderStarted) {
					contenderStarted = true;
					contenderPromise = withFileMutex(
						target,
						async () => {
							contenderObservedOverlap = holderInside;
							contenderEnteredResolve();
							await contenderReleased;
						},
						{ timeoutMs: 100, staleMs: 1_000, pollMs: 5 },
					);
				}
				await contenderEntered;
			},
		});

		await expect(
			withFileMutex(
				target,
				async () => {
					throw new Error('waiter must not enter');
				},
				{
					onContention: 'fail',
					timeoutMs: 80,
					staleMs: 1_000,
					pollMs: 5,
				},
			),
		).rejects.toBeInstanceOf(LockContentionError);

		expect(contenderStarted).toBe(false);
		expect(contenderObservedOverlap).toBe(false);

		releaseContender();
		if (contenderPromise !== undefined) {
			await contenderPromise;
		}
		releaseHolder();
		await holder;
	});
});
