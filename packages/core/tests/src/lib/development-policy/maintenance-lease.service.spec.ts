/**
 * maintenance-lease.service.spec.ts — one server maintains a workspace,
 * however many serve it, and whichever model each one serves.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createHostMaintenance,
	createMaintenanceGate,
	createMaintenanceLease,
	observeMaintenance,
} from '@delendai/core/lib/development-policy/maintenance-lease.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const leasePath = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'maintenance-lease-'));
	roots.push(root);
	return join(root, 'startup', 'maintainer.lease');
};

/** Two servers on one machine, as two sessions of one model start them. */
const pair = (path: string, clock: { at: number }, alive = true) => {
	const options = {
		path,
		machineId: 'laptop',
		now: () => clock.at,
		ttlMs: 1_000,
		isAlive: () => alive,
	};
	return {
		a: createMaintenanceLease({ ...options, pid: 10, nonce: 'aaaa' }),
		b: createMaintenanceLease({ ...options, pid: 11, nonce: 'bbbb' }),
	};
};

describe('createMaintenanceLease', () => {
	it('lets one of two servers hold it, and the other read who', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		expect(await a.hold()).toBe(true);
		expect(await b.hold()).toBe(false);
		expect((await b.holder())?.holder).toBe(a.self);
		expect(a.self).not.toBe(b.self);
	});

	it('stays with a holder that keeps beating', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		await a.hold();
		clock.at = 900;
		expect(await a.hold()).toBe(true);
		clock.at = 1_800;
		expect(await b.hold()).toBe(false);
	});

	it('passes to another server once the holder stops beating', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		await a.hold();
		clock.at = 1_001;
		expect(await b.hold()).toBe(true);
		expect(await a.hold()).toBe(false);
	});

	it('passes at once when the holder process on this machine is gone', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock, false);
		await a.hold();
		expect(await b.hold()).toBe(true);
	});

	it('is free again once its holder releases it, and only its holder can', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		await a.hold();
		await b.release();
		expect((await b.holder())?.holder).toBe(a.self);
		await a.release();
		expect(await b.hold()).toBe(true);
	});

	it('tells apart two servers with one pid on two machines', async () => {
		const path = leasePath();
		const here = createMaintenanceLease({
			path,
			machineId: 'one',
			pid: 7,
			nonce: 'n',
		});
		const there = createMaintenanceLease({
			path,
			machineId: 'two',
			pid: 7,
			nonce: 'n',
		});
		expect(await here.hold()).toBe(true);
		expect(await there.hold()).toBe(false);
	});
});

describe('createMaintenanceGate', () => {
	it('maintains while it holds the lease, and names the holder to the others', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		const first = createMaintenanceGate({ lease: a });
		const second = createMaintenanceGate({ lease: b });
		expect(await first.standDown()).toBeUndefined();
		expect(await second.standDown()).toContain(
			`Server ${a.self} maintains`,
		);
		await first.stop();
		await second.stop();
	});

	it('gives the lease up on older code, so a current server takes over', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		let behind: string | undefined;
		const stale = createMaintenanceGate({
			lease: a,
			behind: async () => behind,
		});
		expect(await stale.standDown()).toBeUndefined();
		behind = 'This server started at abc.';
		expect(await stale.standDown()).toContain('maintains nothing');
		expect(await b.hold()).toBe(true);
		await stale.stop();
	});
});

describe('what the gate tells the log', () => {
	it('says each change of standing once', async () => {
		const clock = { at: 0 };
		const { a } = pair(leasePath(), clock);
		const lines: string[] = [];
		let behind: string | undefined;
		const gate = createMaintenanceGate({
			lease: a,
			behind: async () => behind,
			report: (line) => lines.push(line),
		});
		await gate.standDown();
		await gate.standDown();
		behind = 'Behind.';
		await gate.standDown();
		await gate.standDown();
		await gate.stop();
		expect(lines).toEqual([
			`This server (${a.self}) maintains this workspace.`,
			expect.stringContaining('Behind. It maintains nothing'),
		]);
	});
});

describe('observing who maintains', () => {
	it('takes nothing: a one-off status leaves the lease free', async () => {
		const path = leasePath();
		const lease = createMaintenanceLease({ path, machineId: 'laptop' });
		expect(await observeMaintenance(lease)).toMatchObject({
			maintains: false,
		});
		expect(existsSync(path)).toBe(false);
	});

	it('says older code first, and who maintains', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		await a.hold();
		expect(await observeMaintenance(a)).toEqual({
			maintains: true,
			maintainer: a.self,
		});
		expect(
			await observeMaintenance(b, async () => 'Behind.'),
		).toMatchObject({
			maintains: false,
			maintainer: a.self,
			reason: 'Behind. It maintains nothing until it restarts.',
		});
	});

	it('makes its gate only when a background step first asks', async () => {
		const path = leasePath();
		const maintenance = createHostMaintenance({ path });
		expect((await maintenance.observe()).maintains).toBe(false);
		expect(existsSync(path)).toBe(false);
		expect(await maintenance.gate().standDown()).toBeUndefined();
		expect((await maintenance.observe()).maintains).toBe(true);
		await maintenance.stop();
		expect(existsSync(path)).toBe(false);
	});
});
