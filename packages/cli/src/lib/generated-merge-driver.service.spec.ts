/**
 * generated-merge-driver.service.spec.ts — the driver must work the same
 * from every host.
 *
 * The variable under test is the HOST, not the repository: the same code
 * runs in a Bun terminal, in a Node-hosted editor extension, under
 * `npx`, and inside whatever runtime another agent brings. Until this
 * spec existed, the command git was configured with was simply whatever
 * process happened to run the installer.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { GENERATED_MERGE_DRIVER } from '../contracts/constants/generated-merge-driver.constant';
import {
	driverCommand,
	installGeneratedMergeDriver,
	resolveDriverRuntime,
	uninstallGeneratedMergeDriver,
} from './generated-merge-driver.service';

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'driver-host-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
	return root;
};

const configured = (root: string): string => {
	try {
		return execFileSync(
			'git',
			['config', '--get', `merge.${GENERATED_MERGE_DRIVER}.driver`],
			{ cwd: root, encoding: 'utf8' },
		).trim();
	} catch {
		return '';
	}
};

describe('the driver runs whatever installed it (x00574 S2)', () => {
	it('uses the running process when it is Bun', () => {
		expect(
			resolveDriverRuntime(repo(), undefined, {
				isBun: true,
				execPath: '/opt/bun',
			}),
		).toBe('/opt/bun');
	});

	it('does NOT use the running process when it is Node', () => {
		// The driver is TypeScript with extensionless imports. Node cannot
		// load it, so a command naming Node is a driver that never starts
		// — and git then keeps the conflict, which looks exactly like
		// having no driver at all.
		expect(
			resolveDriverRuntime(repo(), undefined, {
				isBun: false,
				execPath: '/usr/bin/node',
				onPath: () => undefined,
			}),
		).toBeUndefined();
	});

	it('falls back to the workspace Bun when the host is not Bun', () => {
		const root = repo();
		mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
		writeFileSync(join(root, 'node_modules', '.bin', 'bun'), '');
		expect(
			resolveDriverRuntime(root, undefined, {
				isBun: false,
				execPath: '/usr/bin/node',
			}),
		).toBe(join(root, 'node_modules', '.bin', 'bun'));
	});

	it('falls back to Bun on PATH when the workspace has none', () => {
		expect(
			resolveDriverRuntime(repo(), undefined, {
				isBun: false,
				execPath: '/usr/bin/node',
				onPath: () => '/usr/local/bin/bun',
			}),
		).toBe('/usr/local/bin/bun');
	});

	it('lets an explicit runner win over every fallback', () => {
		expect(
			resolveDriverRuntime(repo(), '/custom/runtime', {
				isBun: false,
				execPath: '/usr/bin/node',
			}),
		).toBe('/custom/runtime');
	});

	it('never writes a command naming a runtime that cannot run the script', () => {
		// The decisive one. A configured-but-broken driver is worse than
		// none: git's own merge is a correct fallback, and a driver that
		// cannot start is a silent regression wearing a green tick.
		const root = repo();
		installGeneratedMergeDriver(root, {
			runner: '/usr/bin/node',
			script: join(root, 'driver.ts'),
		});
		const written = configured(root);
		expect(written).not.toContain('/usr/bin/node');
	});

	it('is idempotent, and removable', () => {
		const root = repo();
		const first = installGeneratedMergeDriver(root, {
			runner: process.execPath,
			explicitRunner: '/opt/bun',
			script: join(root, 'driver.ts'),
		});
		expect(first.state).toBe('configured');
		const again = installGeneratedMergeDriver(root, {
			runner: process.execPath,
			explicitRunner: '/opt/bun',
			script: join(root, 'driver.ts'),
		});
		expect(again.state).toBe('unchanged');
		uninstallGeneratedMergeDriver(root);
		expect(configured(root)).toBe('');
	});

	it('spells the command git expects, with every placeholder', () => {
		// `%P` is the pathname, and without it the driver cannot tell WHICH
		// generated file it is regenerating.
		const command = driverCommand({
			runner: '/opt/bun',
			script: '/repo/driver.ts',
		});
		expect(command).toBe('/opt/bun /repo/driver.ts %O %A %B %P');
	});
});
