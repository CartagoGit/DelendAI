import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireDeliverLock } from './work-deliver-lock.service';

describe('acquireDeliverLock', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'deliver-lock-'));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('refuses a second acquire while the first holder pid is alive, naming it', async () => {
		const first = await acquireDeliverLock('/unit', {
			dir,
			pid: 111,
			isAlive: () => true,
		});
		expect(first.held).toBe(true);
		const second = await acquireDeliverLock('/unit', {
			dir,
			pid: 222,
			isAlive: () => true,
		});
		expect(second).toEqual({ held: false, pid: 111 });
	});

	it('takes over a lock whose pid is dead', async () => {
		await acquireDeliverLock('/unit', {
			dir,
			pid: 111,
			isAlive: () => true,
		});
		const taken = await acquireDeliverLock('/unit', {
			dir,
			pid: 222,
			isAlive: (pid) => pid !== 111,
		});
		expect(taken.held).toBe(true);
	});

	it('locks units independently and frees the lock on release', async () => {
		const alive = () => true;
		const a = await acquireDeliverLock('/a', {
			dir,
			pid: 1,
			isAlive: alive,
		});
		const b = await acquireDeliverLock('/b', {
			dir,
			pid: 2,
			isAlive: alive,
		});
		expect([a.held, b.held]).toEqual([true, true]);
		if (a.held) await a.release();
		const again = await acquireDeliverLock('/a', {
			dir,
			pid: 3,
			isAlive: alive,
		});
		expect(again.held).toBe(true);
	});

	it('does not release a lock another pid took over', async () => {
		const first = await acquireDeliverLock('/unit', {
			dir,
			pid: 111,
			isAlive: () => true,
		});
		await acquireDeliverLock('/unit', {
			dir,
			pid: 222,
			isAlive: (pid) => pid !== 111,
		});
		if (first.held) await first.release();
		const third = await acquireDeliverLock('/unit', {
			dir,
			pid: 333,
			isAlive: () => true,
		});
		expect(third).toEqual({ held: false, pid: 222 });
	});
});
