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

	const pump = async (steps: number, advanceMono: number): Promise<void> => {
		for (let i = 0; i < steps; i++) {
			await tick();
			mono += advanceMono;
			await vi.advanceTimersByTimeAsync(25);
		}
	};

	it('[<200ms] a wall-clock step of 5.6 s does not time a waiter out', async () => {
		const target = join(dir, 'a.json');
		const holder = await hold(target);
		const waiter = withFileMutex(target, async () => 'got-it', {
			timeoutMs: 1_000,
			pollMs: 25,
		});
		await pump(3, 2);
		wall += WALL_STEP_MS;
		await pump(3, 2);
		holder.release();
		await pump(5, 2);
		await expect(waiter).resolves.toBe('got-it');
		await holder.done;
	});

	it('[<200ms] monotonic time past timeoutMs times the waiter out with the wall clock still', async () => {
		const target = join(dir, 'b.json');
		const holder = await hold(target);
		const waiter = withFileMutex(target, async () => 'never', {
			timeoutMs: 1_000,
			pollMs: 25,
		});
		const outcome = waiter.then(
			() => undefined,
			(error: unknown) => error,
		);
		await pump(3, 2);
		mono += 1_500;
		await pump(3, 2);
		expect(await outcome).toBeInstanceOf(LockContentionError);
		holder.release();
		await pump(2, 2);
		await holder.done;
	});
});
