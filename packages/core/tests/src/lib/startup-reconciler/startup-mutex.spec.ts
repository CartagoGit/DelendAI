/**
 * startup-mutex.spec.ts — a start-up lock is taken over only from a
 * holder that is gone, and a holder releases only its own lock.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createStartupMutex } from '@delendai/core/lib/startup-reconciler/startup-mutex';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const lockPath = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'startup-mutex-'));
	roots.push(root);
	return join(root, 'startup', 'reconcile.lock');
};

describe('createStartupMutex', () => {
	it('keeps a live holder on this machine, however long past the TTL', async () => {
		const path = lockPath();
		const clock = { at: 0, now: () => clock.at };
		const slow = createStartupMutex({
			path,
			machineId: 'laptop',
			clock,
			pid: 10,
			ttlMs: 1_000,
			isAlive: () => true,
		});
		const next = createStartupMutex({
			path,
			machineId: 'laptop',
			clock,
			pid: 11,
			ttlMs: 1_000,
			isAlive: () => true,
		});

		expect((await slow.acquire()).kind).toBe('acquired');
		clock.at = 60_000;
		expect((await next.acquire()).kind).toBe('busy');
	});

	it('takes over from a holder whose process is gone, and the old holder cannot release the new lock', async () => {
		const path = lockPath();
		const clock = { at: 0, now: () => clock.at };
		const dead = createStartupMutex({
			path,
			machineId: 'laptop',
			clock,
			pid: 10,
			ttlMs: 1_000,
			isAlive: () => false,
		});
		const next = createStartupMutex({
			path,
			machineId: 'laptop',
			clock,
			pid: 11,
			ttlMs: 1_000,
			isAlive: () => false,
		});

		const first = await dead.acquire();
		expect(first.kind).toBe('acquired');
		const second = await next.acquire();
		expect(second.kind).toBe('acquired');
		// The first holder comes back and releases: it is no longer its lock.
		if (first.kind === 'acquired') await first.release();
		expect(existsSync(path)).toBe(true);
		if (second.kind === 'acquired') await second.release();
		expect(existsSync(path)).toBe(false);
	});

	it('takes over a lock left on another machine only once it outlives the TTL', async () => {
		const path = lockPath();
		const clock = { at: 0, now: () => clock.at };
		const there = createStartupMutex({
			path,
			machineId: 'office',
			clock,
			pid: 10,
			ttlMs: 1_000,
		});
		const here = createStartupMutex({
			path,
			machineId: 'laptop',
			clock,
			pid: 11,
			ttlMs: 1_000,
		});

		expect((await there.acquire()).kind).toBe('acquired');
		expect((await here.acquire()).kind).toBe('busy');
		clock.at = 2_000;
		expect((await here.acquire()).kind).toBe('acquired');
	});
});
