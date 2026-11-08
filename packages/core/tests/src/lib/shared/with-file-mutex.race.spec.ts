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

const readStructuredLease = async (path: string): Promise<IStructuredLease> => {
	// `open(..., 'wx')` makes the sidecar visible before the first async
	// handle.write completes. Wait for a parseable lease instead of making
	// this race test depend on that tiny, valid creation window.
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			return JSON.parse(readFileSync(path, 'utf8')) as IStructuredLease;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
	}
	throw new Error(`lock lease was not written: ${path}`);
};

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

		const liveLease = await readStructuredLease(lockPath);
		writeStructuredLease(lockPath, {
			...liveLease,
			generation: liveLease.generation + 1,
			heartbeatAt: Date.now() - 60_000,
		});

		let observedStaleCount = 0;
		let reclaimRenameCount = 0;

		__setWithFileMutexTestHooks({
			// x00420: an aged lease alone no longer means "abandoned" —
			// the reclaimer also asks whether the holder's process is
			// still running, and in a single-process test that pid is
			// ours, so a real holder would look alive forever. A holder
			// that is genuinely abandoned is one whose process is gone,
			// which is what this probe states.
			isPidAlive: () => false,
			afterObserveStale: async () => {
				observedStaleCount += 1;
				const observedLease = await readStructuredLease(lockPath);
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
