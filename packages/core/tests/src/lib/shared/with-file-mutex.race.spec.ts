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

		const liveLease = readStructuredLease(lockPath);
		writeStructuredLease(lockPath, {
			...liveLease,
			generation: liveLease.generation + 1,
			heartbeatAt: Date.now() - 60_000,
		});

		let observedStaleCount = 0;
		let reclaimRenameCount = 0;

		__setWithFileMutexTestHooks({
			afterObserveStale: () => {
				observedStaleCount += 1;
				const observedLease = readStructuredLease(lockPath);
				writeStructuredLease(lockPath, {
					...observedLease,
					generation: observedLease.generation + 1,
					heartbeatAt: Date.now(),
				});
			},
			afterReclaimRename: async () => {
				reclaimRenameCount += 1;
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

		expect(observedStaleCount).toBe(1);
		expect(reclaimRenameCount).toBe(0);
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
