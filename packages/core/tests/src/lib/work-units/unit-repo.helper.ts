/**
 * A throwaway repository with units of work, for the specs that judge
 * them: real git, real worktrees, nothing mocked.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

export const unitPolicy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

export const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const roots: string[] = [];

export const cleanUnitRepos = (): void => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
};

export const unitRef = (agent: string, unit = 'x1-S1-g1', topic = 'work') =>
	`delendai/wip/${agent}/implement/${unit}/${topic}`;

export interface IUnitRepo {
	readonly root: string;
	/** Enter a unit: a ref off develop plus a worktree beside the repo. */
	readonly enter: (ref: string) => string;
	/** Commit a file in the unit's worktree. */
	readonly commit: (worktree: string, file: string) => void;
}

export const unitRepo = (): IUnitRepo => {
	const parent = mkdtempSync(join(tmpdir(), 'unit-'));
	roots.push(parent);
	const root = join(parent, 'repo');
	execFileSync('git', ['init', '-q', '-b', 'develop', root]);
	git(root, 'config', 'user.email', 'unit@example.com');
	git(root, 'config', 'user.name', 'Unit');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'base.ts'), 'export const base = 0;\n');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	let count = 0;
	return {
		root,
		enter: (ref) => {
			git(root, 'update-ref', `refs/heads/${ref}`, 'develop');
			count += 1;
			const worktree = join(parent, `wt-${String(count)}`);
			git(root, 'worktree', 'add', '-q', worktree, ref);
			return worktree;
		},
		commit: (worktree, file) => {
			writeFileSync(
				join(worktree, file),
				`export const f = '${file}';\n`,
			);
			git(worktree, 'add', '-A');
			git(worktree, 'commit', '-q', '-m', `feat: ${file}`);
		},
	};
};
