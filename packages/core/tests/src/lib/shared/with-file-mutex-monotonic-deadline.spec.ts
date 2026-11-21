import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	LockContentionError,
	withFileMutex,
} from '@delendai/core/lib/shared/with-file-mutex';

const WALL_STEP_MS = 5_600;

/** Let real fs callbacks run; setImmediate is not faked. */
const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('withFileMutex deadline is monotonic', () => {
	let dir: string;
	let wall: number;
	let mono: number;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mutex-mono-'));
		wall = 1_700_000_000_000;
		mono = 1_000;
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		vi.spyOn(Date, 'now').mockImplementation(() => wall);
		vi.spyOn(performance, 'now').mockImplementation(() => mono);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		rmSync(dir, { recursive: true, force: true });
	});

	/** Hold the lock until `release()`, returning once it is held. */
	const hold = async (target: string) => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		let entered!: () => void;
		const inside = new Promise<void>((r) => {
			entered = r;
		});
		const done = withFileMutex(target, async () => {
			entered();
			await gate;
		});
		await inside;
		return { release, done };
	};

	/**
	 * Real fs round trips sit between two fake sleeps: wait until the
	 * waiter is parked on its next sleep (or has settled), then advance.
	 */
	const pump = async (
		steps: number,
		advanceMono: number,
		settled: () => boolean = () => false,
	): Promise<void> => {
		for (let step = 0; step < steps && !settled(); step++) {
			for (
				let i = 0;
				i < 10_000 && !settled() && vi.getTimerCount() === 0;
				i++
			) {
				await tick();
			}
			if (settled()) return;
			mono += advanceMono;
			await vi.advanceTimersByTimeAsync(25);
		}
	};

	/** Track when a promise has settled, whichever way. */
	const watch = <T>(promise: Promise<T>) => {
		let done = false;
		const outcome = promise.then(
			(value) => {
				done = true;
				return value;
			},
			(error: unknown) => {
				done = true;
				return error;
			},
		);
		return { outcome, settled: () => done };
	};

	it('[<200ms] a wall-clock step of 5.6 s does not time a waiter out', async () => {
		const target = join(dir, 'a.json');
		const holder = await hold(target);
		const waiter = watch(
			withFileMutex(target, async () => 'got-it', {
				timeoutMs: 1_000,
				pollMs: 25,
			}),
		);
		await pump(3, 2, waiter.settled);
		wall += WALL_STEP_MS;
		await pump(3, 2, waiter.settled);
		expect(waiter.settled()).toBe(false);
		holder.release();
		await pump(50, 2, waiter.settled);
		expect(await waiter.outcome).toBe('got-it');
		await holder.done;
	});

	it('[<200ms] monotonic time past timeoutMs times the waiter out with the wall clock still', async () => {
		const target = join(dir, 'b.json');
		const holder = await hold(target);
		const waiter = watch(
			withFileMutex(target, async () => 'never', {
				timeoutMs: 1_000,
				pollMs: 25,
			}),
		);
		await pump(3, 2, waiter.settled);
		mono += 1_500;
		await pump(50, 2, waiter.settled);
		expect(await waiter.outcome).toBeInstanceOf(LockContentionError);
		holder.release();
		await holder.done;
	});
});
