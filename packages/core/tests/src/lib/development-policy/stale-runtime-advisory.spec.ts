/**
 * A server running older code than its checkout says so (x00701).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { waitUntil } from '@delendai/test-kit';

import {
	createStaleRuntimeAdvisory,
	createStaleRuntimeWatch,
	staleRuntimeAdvisoryFor,
} from '@delendai/core/lib/development-policy/stale-runtime-advisory';

import type { ICheckpointAdvisoryContext } from '@delendai/core/lib/contracts/interfaces/checkpoint-advisory.interface';

const CALL: ICheckpointAdvisoryContext = { toolName: 't', args: {} };
const BOOT = 'a'.repeat(40);
const NOW = 'b'.repeat(40);

describe('staleRuntimeAdvisoryFor', () => {
	it('names the restart when a source file the server runs changed', () => {
		const advisory = staleRuntimeAdvisoryFor({
			bootHead: BOOT,
			head: NOW,
			changed: ['packages/cli/src/commands/work.command.ts', 'README.md'],
		});
		expect(advisory?.code).toBe('SERVER_BEHIND_CHECKOUT');
		expect(advisory?.message).toContain('1 source file(s)');
		expect(advisory?.nextAction).toContain(
			'Restart the delendai MCP server',
		);
	});

	it('stays quiet when nothing the server runs changed', () => {
		expect(
			staleRuntimeAdvisoryFor({
				bootHead: BOOT,
				head: NOW,
				changed: [
					'docs/delendai/proposals/review/x1.md',
					'plugins/a/tests/x.spec.ts',
				],
			}),
		).toBeNull();
		expect(
			staleRuntimeAdvisoryFor({
				bootHead: BOOT,
				head: BOOT,
				changed: [],
			}),
		).toBeNull();
	});
});

describe('createStaleRuntimeAdvisory', () => {
	it('records the boot commit, then compares the checkout on its interval', async () => {
		let head = BOOT;
		let clock = 0;
		const advisory = createStaleRuntimeAdvisory('/repo', {
			head: async () => head,
			changedBetween: async () => ['plugins/proposals/src/lib/x.ts'],
			now: () => clock,
			intervalMs: 10,
		});
		await Promise.resolve();
		expect(advisory(CALL)).toBeNull();
		head = NOW;
		clock = 20;
		await waitUntil(
			'the checkout comparison lands',
			() => advisory(CALL)?.code === 'SERVER_BEHIND_CHECKOUT',
		);
	});
});

describe('createStaleRuntimeWatch (x00709)', () => {
	it('answers behind() from a fresh reading, not the advisory interval', async () => {
		let head = BOOT;
		let changed = ['plugins/proposals/src/lib/x.ts'];
		const watch = createStaleRuntimeWatch('/repo', {
			head: async () => head,
			changedBetween: async () => changed,
			now: () => 0,
			intervalMs: 60_000,
		});
		expect(await watch.behind()).toBeUndefined();
		head = NOW;
		expect(await watch.behind()).toContain('source file(s) it runs');
		changed = ['docs/delendai/x.md'];
		expect(await watch.behind()).toBeUndefined();
	});
});

describe('the watch on a real checkout', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
		delete process.env.DELENDAI_SUPERVISED;
	});

	const git = (cwd: string, ...args: string[]): void => {
		execFileSync('git', args, { cwd, stdio: 'ignore' });
	};

	const checkout = (): string => {
		const root = mkdtempSync(join(tmpdir(), 'stale-runtime-'));
		roots.push(root);
		git(root, 'init', '-q', '-b', 'develop');
		git(root, 'config', 'user.email', 'stale@example.test');
		git(root, 'config', 'user.name', 'Stale');
		git(root, 'config', 'commit.gpgsign', 'false');
		mkdirSync(join(root, 'packages/core/src'), { recursive: true });
		writeFileSync(join(root, 'packages/core/src/a.ts'), 'export {};\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'boot');
		return root;
	};

	it('reads the commits and the changed sources with git itself', async () => {
		const root = checkout();
		const watch = createStaleRuntimeWatch(root);
		expect(await watch.behind()).toBeUndefined();
		writeFileSync(
			join(root, 'packages/core/src/a.ts'),
			'export const a = 1;\n',
		);
		git(root, 'commit', '-q', '-am', 'moved on');
		expect(await watch.behind()).toContain('1 source file(s) it runs');
	});

	it('tells a supervised server it moves on by itself', () => {
		process.env.DELENDAI_SUPERVISED = '1';
		const advisory = staleRuntimeAdvisoryFor({
			bootHead: BOOT,
			head: NOW,
			changed: ['packages/core/src/a.ts'],
		});
		expect(advisory?.nextAction).toContain('supervised');
	});
});
