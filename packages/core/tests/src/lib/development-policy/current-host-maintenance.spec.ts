/**
 * current-host-maintenance.spec.ts — the maintenance is kept per
 * workspace, so two servers on two workspaces in one process each gate
 * their own background work and never borrow the other's (x01020).
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createHostMaintenance,
	createMaintenanceGate,
	currentHostMaintenance,
} from '@delendai/core/lib/development-policy/maintenance-lease.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/** What a server does at start: one maintenance for its workspace. */
const serverOn = () => {
	const root = mkdtempSync(join(tmpdir(), 'maintenance-ws-'));
	roots.push(root);
	const path = join(root, '.cache', 'delendai', 'maintenance.json');
	return {
		root,
		path,
		maintenance: createHostMaintenance({ workspace: root, path }),
	};
};

describe('currentHostMaintenance', () => {
	it('is the maintenance this process made for the workspace asked about', () => {
		const one = serverOn();
		expect(currentHostMaintenance(one.root)).toBe(one.maintenance);
		expect(currentHostMaintenance(join(one.root, '.'))).toBe(
			one.maintenance,
		);
	});

	it('gives each of two workspaces in one process its own maintenance, never the other one', async () => {
		const first = serverOn();
		const second = serverOn();
		expect(currentHostMaintenance(first.root)).toBe(first.maintenance);
		expect(currentHostMaintenance(second.root)).toBe(second.maintenance);
		// A plugin call in the first workspace takes the first lease only.
		await currentHostMaintenance(first.root)?.gate().standDown();
		expect(existsSync(first.path)).toBe(true);
		expect(existsSync(second.path)).toBe(false);
		await currentHostMaintenance(second.root)?.gate().standDown();
		expect(existsSync(second.path)).toBe(true);
		await first.maintenance.stop();
		await second.maintenance.stop();
	});

	it('has none for a workspace nothing made one for, and none once stopped', async () => {
		const one = serverOn();
		expect(
			currentHostMaintenance(join(one.root, 'elsewhere')),
		).toBeUndefined();
		await one.maintenance.stop();
		expect(currentHostMaintenance(one.root)).toBeUndefined();
	});
});

describe('the gate beats on its own', () => {
	it('decides again on every beat, and a beat that fails is swallowed', async () => {
		const lines: string[] = [];
		let fail = false;
		const gate = createMaintenanceGate({
			lease: {
				self: 'beating',
				hold: async () => {
					if (fail) throw new Error('lease unreadable');
					return true;
				},
				release: async () => undefined,
				holder: async () => undefined,
			},
			heartbeatMs: 5,
			report: (line) => lines.push(line),
		});
		await new Promise((done) => setTimeout(done, 30));
		expect(lines).toEqual([
			'This server (beating) maintains this workspace.',
		]);
		fail = true;
		await new Promise((done) => setTimeout(done, 30));
		expect(lines).toHaveLength(1);
		await gate.stop();
	});
});
