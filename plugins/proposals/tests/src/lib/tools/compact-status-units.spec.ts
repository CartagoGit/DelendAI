/**
 * compact-status-units.spec.ts — the status counts the units of work, which
 * is how a worktree-isolated swarm holds its work: such a swarm takes no
 * file locks, so `locks` alone read as "nobody is working".
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	collectCompactStatus,
	type ICompactStatusOptions,
} from '@delendai/proposals/lib/tools/compact-status.tool';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const workspaceWithUnits = (
	agents: readonly string[],
): ICompactStatusOptions => {
	const dir = mkdtempSync(join(tmpdir(), 'compact-units-'));
	dirs.push(dir);
	const root = join(dir, 'repo');
	execFileSync('git', ['init', '-q', '-b', 'develop', root]);
	git(root, 'config', 'user.email', 'unit@example.com');
	git(root, 'config', 'user.name', 'Unit');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'base.ts'), 'export const base = 0;\n');
	git(root, 'add', '.');
	git(root, 'commit', '-q', '-m', 'base');
	for (const agent of agents) {
		git(root, 'branch', `delendai/wip/${agent}/implement/x1-S1-g1/work`);
	}
	writeFileSync(join(dir, 'closed.json'), JSON.stringify([]));
	return {
		namespacePrefix: 'proposals',
		lockPathAbs: join(dir, 'agents.lock.json'),
		queuePathAbs: join(dir, 'queue.json'),
		closedTasksPathAbs: join(dir, 'closed.json'),
		indexPathAbs: join(dir, 'index.json'),
		workspaceRoot: root,
		developmentPolicy: policy,
	};
};

describe('compact_status — units of work', () => {
	it('counts every unit while no file lock is taken', async () => {
		const status = await collectCompactStatus(
			workspaceWithUnits(['alpha', 'beta', 'gamma']),
		);
		expect(status.locks?.active).toBe(0);
		expect(status.units).toBe('3 live, 0 idle, 0 abandoned, 0 delivered');
	});

	it('says nothing about units where no policy names their refs', async () => {
		const { developmentPolicy: _policy, ...options } = workspaceWithUnits([
			'alpha',
		]);
		const status = await collectCompactStatus(options);
		expect(status.units).toBeUndefined();
	});

	it('leaves units out when the caller asks for other fields', async () => {
		const status = await collectCompactStatus(
			workspaceWithUnits(['alpha']),
			['locks'],
		);
		expect(status.units).toBeUndefined();
		expect(status.locks?.active).toBe(0);
	});
});
