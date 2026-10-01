/**
 * work-unit-profiles.spec.ts — one unit-of-work mechanism per profile.
 *
 * `worktree-pr` used to declare branch persistence while `work enter`,
 * `work checkpoint` and `work publish` (which are profile-blind) required
 * a work ref, and `agent_worktree` made `agent/*` branches none of them
 * accept. Real git, each profile: the worktree and branch `work enter`
 * makes are the ones `checkpoint` and `publish` take, and publish
 * produces the publication ref.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const contextFor = (root: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			IWorkUnitContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: root, json: true, remote: undefined }),
	});

/** A repository on `profile`, with an origin that accepts pushes. */
const repoOn = (profile: string): string => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'work-prof-')));
	const remote = mkdtempSync(join(tmpdir(), 'work-prof-remote-'));
	roots.push(root, remote);
	execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile,
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	return root;
};

const UNIT = [
	'--proposal=x1',
	'--slice=S1',
	'--agent=claude-sonnet-5-5',
	'--topic=probe',
] as const;

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe.each(['shared-checkout-pr', 'worktree-pr'])(
	'work units under %s',
	(profile) => {
		it('enter makes a worktree on the work ref, which publish turns into the publication ref', async () => {
			const root = repoOn(profile);
			const entered = await runWorkUnit(
				['enter', ...UNIT],
				contextFor(root),
			);
			expect(entered.code).toBe(0);
			const data = entered.data as {
				readonly path: string;
				readonly branch: string;
			};
			expect(data.branch).toBe(
				'delendai/wip/claude-sonnet-5-5/implement/x1-S1-g1/probe',
			);
			expect(existsSync(data.path)).toBe(true);
			expect(git(data.path, 'symbolic-ref', '--short', 'HEAD')).toBe(
				data.branch,
			);
			// The shared checkout never moved.
			expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe(
				'develop',
			);

			writeFileSync(join(data.path, 'a.ts'), 'export const a = 1;\n');
			git(data.path, 'add', 'a.ts');
			git(data.path, 'commit', '-q', '-m', 'feat: a');

			const published = await runWorkUnit(
				['publish', ...UNIT],
				contextFor(root),
			);
			expect(published.code).toBe(0);
			expect(published.data).toMatchObject({ published: true });
			expect(
				git(root, 'ls-remote', 'origin', 'refs/heads/delendai/pr/**'),
			).toContain(
				'refs/heads/delendai/pr/claude-sonnet-5-5/implement/x1-S1-g1/probe',
			);
		});

		it('checkpoint accepts the unit that enter made', async () => {
			const root = repoOn(profile);
			const entered = await runWorkUnit(
				['enter', ...UNIT],
				contextFor(root),
			);
			const { path } = entered.data as { readonly path: string };
			// A shared checkout is pinned to develop and checkpoints from
			// there, without moving HEAD; under `worktree-pr` the agent's
			// own worktree is where it works, and it checkpoints from it.
			const where = profile === 'worktree-pr' ? path : root;
			writeFileSync(join(where, 'b.ts'), 'export const b = 1;\n');
			const result = await runWorkUnit(
				['checkpoint', ...UNIT, '--paths=b.ts', '--message=feat: b'],
				contextFor(where),
			);
			expect(result.code).toBe(0);
			expect(result.data).toMatchObject({
				status: 'created',
				ref: 'refs/heads/delendai/wip/claude-sonnet-5-5/implement/x1-S1-g1/probe',
			});
		});
	},
);
