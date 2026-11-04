/**
 * unit-leaves-progress.service.spec.ts — the commit that moves a
 * proposal out of in-progress names the publication of its unit.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { publicationOnLeavingProgress } from '@delendai/core/lib/work-units/unit-leaves-progress.service';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});
const BRANCH = 'delendai/wip/agent-a/implement/x00001-all-g2/the-topic';

describe('publicationOnLeavingProgress', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	const unit = () => {
		const root = mkdtempSync(join(tmpdir(), 'leaves-progress-'));
		dirs.push(root);
		git(root, 'init', '-q', '-b', BRANCH);
		git(root, 'config', 'user.name', 'spec');
		git(root, 'config', 'user.email', 'spec@example.invalid');
		const move = (to: string, from?: string) => {
			mkdirSync(join(root, 'docs/delendai/proposals', to), {
				recursive: true,
			});
			if (from === undefined)
				writeFileSync(
					join(root, 'docs/delendai/proposals', to, 'x00001-a.md'),
					'# x00001\n',
				);
			else
				git(
					root,
					'mv',
					`docs/delendai/proposals/${from}/x00001-a.md`,
					`docs/delendai/proposals/${to}/x00001-a.md`,
				);
			git(root, 'add', '-A');
			git(root, 'commit', '-q', '-m', `to ${to}`);
		};
		return { root, move };
	};
	const ask = (cwd: string, branch: string | undefined = BRANCH) =>
		publicationOnLeavingProgress({
			cwd,
			branch,
			inMainWorktree: false,
			policy,
		});

	it('names the publication when the last commit took the proposal out of in-progress, and not into it', () => {
		const { root, move } = unit();
		move('ready');
		move('in-progress', 'ready');
		expect(ask(root)).toBeUndefined();
		move('paused', 'in-progress');
		expect(ask(root)).toEqual([
			'publish',
			'--kind=implement',
			'--proposal=x00001',
			'--slice=all',
			'--agent=agent-a',
			'--generation=2',
			'--topic=the-topic',
		]);
		// A commit that does not move the proposal names nothing.
		writeFileSync(join(root, 'notes.md'), 'more\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'notes');
		expect(ask(root)).toBeUndefined();
	});

	it('names the publication when a proposal moves between two other folders, as a retirement from paused does', () => {
		const { root, move } = unit();
		move('paused');
		move('retired', 'paused');
		expect(ask(root)?.[0]).toBe('publish');
	});

	it('names nothing for the shared checkout or a branch outside the work namespace', () => {
		const { root, move } = unit();
		move('in-progress');
		move('review', 'in-progress');
		expect(ask(root, 'feature/x')).toBeUndefined();
		expect(
			publicationOnLeavingProgress({
				cwd: root,
				branch: BRANCH,
				inMainWorktree: true,
				policy,
			}),
		).toBeUndefined();
	});
});
