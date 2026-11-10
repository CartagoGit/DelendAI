/**
 * maintenance-lease.service.spec.ts — one server maintains a workspace,
 * however many serve it, and whichever model each one serves.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createHostMaintenance,
	createMaintenanceGate,
	createMaintenanceLease,
	removeIfStill,
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
	it('[<100ms] lets one of two servers hold it, and the other read who', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		expect(await a.hold()).toBe(true);
		expect(await b.hold()).toBe(false);
		expect((await b.holder())?.holder).toBe(a.self);
		expect(a.self).not.toBe(b.self);
	});

	it('[<450ms] ends a race on an absent lease with one holder, the one the file names', async () => {
		for (let round = 0; round < 25; round += 1) {
			const clock = { at: 0 };
			const { a, b } = pair(leasePath(), clock);
			const [tookA, tookB] = await Promise.all([a.hold(), b.hold()]);
			expect([tookA, tookB].filter(Boolean)).toHaveLength(1);
			expect((await a.holder())?.holder).toBe(tookA ? a.self : b.self);
		}
	});

	it('[<50ms] stays with a holder that keeps beating', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		await a.hold();
		clock.at = 900;
		expect(await a.hold()).toBe(true);
		clock.at = 1_800;
		expect(await b.hold()).toBe(false);
	});

	it('[<50ms] passes to another server once the holder stops beating', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		await a.hold();
		clock.at = 1_001;
		expect(await b.hold()).toBe(true);
		expect(await a.hold()).toBe(false);
	});

	it('[<30ms] passes at once when the holder process on this machine is gone', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock, false);
		await a.hold();
		expect(await b.hold()).toBe(true);
	});

	it('[<30ms] is free again once its holder releases it, and only its holder can', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock);
		await a.hold();
		await b.release();
		expect((await b.holder())?.holder).toBe(a.self);
		await a.release();
		expect(await b.hold()).toBe(true);
	});

	it('[<30ms] tells apart two servers with one pid on two machines', async () => {
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

describe('the lease scratch files (js/insecure-temporary-file)', () => {
	it('[<30ms] leaves the lease 0600 and no scratch file behind, taking and renewing', async () => {
		const path = leasePath();
		const { a } = pair(path, { at: 0 });
		expect(await a.hold()).toBe(true);
		expect(await a.hold()).toBe(true);
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(readdirSync(dirname(path))).toEqual(['maintainer.lease']);
	});

	it('[<30ms] does not write through a file or link planted at the old predictable name', async () => {
		const path = leasePath();
		const { a } = pair(path, { at: 0 });
		mkdirSync(dirname(path), { recursive: true });
		const victim = join(dirname(path), 'victim');
		writeFileSync(victim, 'untouched');
		symlinkSync(victim, `${path}.${a.self.replace(/[^\w.-]/gu, '_')}`);
		expect(await a.hold()).toBe(true);
		expect(readFileSync(victim, 'utf8')).toBe('untouched');
	});
});

describe('createMaintenanceGate', () => {
	it('[<30ms] maintains while it holds the lease, and names the holder to the others', async () => {
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

	it('[<30ms] gives the lease up on older code, so a current server takes over', async () => {
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
	it('[<30ms] says each change of standing once', async () => {
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
	it('[<30ms] never names a dead holder as the maintainer, and the next server takes over once', async () => {
		const clock = { at: 0 };
		const { a, b } = pair(leasePath(), clock, false);
		await a.hold();
		// The holder's pid is dead on this machine: nobody maintains, and
		// the line says so instead of naming the dead server.
		const standing = await observeMaintenance(b);
		expect(standing).toEqual({
			maintains: false,
			reason: 'No server holds the maintenance lease yet.',
		});
		const told: string[] = [];
		const gate = createMaintenanceGate({
			lease: b,
			report: (line) => told.push(line),
		});
		try {
			expect(await gate.standDown()).toBeUndefined();
			expect(await gate.standDown()).toBeUndefined();
		} finally {
			await gate.stop();
		}
		expect(told).toEqual([
			`This server (${b.self}) maintains this workspace.`,
		]);
		expect(told.join('\n')).not.toContain(a.self);
	});

	it('[<30ms] takes nothing: a one-off status leaves the lease free', async () => {
		const path = leasePath();
		const lease = createMaintenanceLease({ path, machineId: 'laptop' });
		expect(await observeMaintenance(lease)).toMatchObject({
			maintains: false,
		});
		expect(existsSync(path)).toBe(false);
	});

	it('[<30ms] says older code first, and who maintains', async () => {
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

	it('[<30ms] makes its gate only when a background step first asks', async () => {
		const path = leasePath();
		const maintenance = createHostMaintenance({
			workspace: dirname(path),
			path,
		});
		expect((await maintenance.observe()).maintains).toBe(false);
		expect(existsSync(path)).toBe(false);
		expect(await maintenance.gate().standDown()).toBeUndefined();
		expect((await maintenance.observe()).maintains).toBe(true);
		await maintenance.stop();
		expect(existsSync(path)).toBe(false);
	});
});

describe('removeIfStill', () => {
	it('[<30ms] removes the record it judged, and puts back one replaced since', async () => {
		const path = leasePath();
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, 'judged');
		expect(await removeIfStill(path, 'judged', `${path}.me`)).toBe(true);
		expect(() => readFileSync(path, 'utf8')).toThrow();

		writeFileSync(path, 'taken by another server since');
		expect(await removeIfStill(path, 'judged', `${path}.me`)).toBe(false);
		expect(readFileSync(path, 'utf8')).toBe(
			'taken by another server since',
		);

		rmSync(path);
		expect(await removeIfStill(path, 'judged', `${path}.me`)).toBe(true);
	});
});
