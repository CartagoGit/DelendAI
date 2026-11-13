/**
 * maintenance-lease-path.spec.ts — a unit worktree never holds its own
 * maintenance lease: it resolves to the shared checkout's.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { maintenanceLeasePath } from '@delendai/core/lib/development-policy/maintenance-lease-path';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): void => {
	execFileSync('git', args, { cwd, stdio: 'ignore' });
};

describe('maintenanceLeasePath', () => {
	it('resolves a linked worktree to the shared checkout', () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'lease-path-')));
		roots.push(root);
		const main = join(root, 'main');
		mkdirSync(main);
		git(main, 'init', '-q');
		git(
			main,
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t',
			'commit',
			'-q',
			'--allow-empty',
			'-m',
			'init',
		);
		const unit = join(root, 'unit');
		git(main, 'worktree', 'add', '-q', '-b', 'unit', unit);
		const expected = join(main, '.cache/delendai/startup/maintainer.lease');
		expect(maintenanceLeasePath(unit, '.cache/delendai')).toBe(expected);
		expect(maintenanceLeasePath(main, '.cache/delendai')).toBe(expected);
	});

	it('falls back to the workspace outside a repository', () => {
		const lease = maintenanceLeasePath(
			'/work/space',
			'.cache/delendai',
			() => undefined,
		);
		expect(lease).toBe(
			'/work/space/.cache/delendai/startup/maintainer.lease',
		);
	});

	it('uses an absolute cache dir as given', () => {
		const lease = maintenanceLeasePath('/w', '/abs/cache', () => '/shared');
		expect(lease).toBe('/abs/cache/startup/maintainer.lease');
	});
});
