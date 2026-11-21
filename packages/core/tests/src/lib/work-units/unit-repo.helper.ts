/**
 * A throwaway repository with units of work, for the specs that judge
 * them: real git, real worktrees, nothing mocked.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createSharedGitRepoTemplate } from '@delendai/test-kit';

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

/**
 * The repository every unit case starts from: built once per worker and
 * copied per case. Built per case it was six git processes before the case
 * did anything (14 spec files share this helper).
 */
const template = createSharedGitRepoTemplate({
	trunk: 'develop',
	files: {
		'base.ts': 'export const base = 0;\n',
		'delendai.config.json': JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	},
});

export const unitRepo = (): IUnitRepo => {
	const { root } = template.copy();
	const parent = dirname(root);
	roots.push(parent);
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

/**
 * Commit `files` onto `ref` the way its unit's worktree would, without a
 * worktree and without touching the shared checkout: work reaches a ref
 * by commit, and nothing is taken from the shared checkout (x01003).
 * Starts the ref at `base` when it does not exist yet.
 */
export const commitOnRef = (
	root: string,
	ref: string,
	files: Readonly<Record<string, string>>,
	options: { readonly base?: string; readonly message?: string } = {},
): string => {
	const full = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`;
	const at = (revision: string): string | undefined => {
		try {
			return git(root, 'rev-parse', '--verify', '-q', revision);
		} catch {
			return undefined;
		}
	};
	const parent =
		at(full) ?? git(root, 'rev-parse', options.base ?? 'develop');
	const dir = mkdtempSync(join(tmpdir(), 'unit-index-'));
	roots.push(dir);
	const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
	const plumb = (args: readonly string[], input?: string): string =>
		execFileSync('git', [...args], {
			cwd: root,
			env,
			encoding: 'utf8',
			...(input === undefined ? {} : { input }),
		}).trim();
	plumb(['read-tree', parent]);
	for (const [path, content] of Object.entries(files)) {
		const blob = plumb(['hash-object', '-w', '--stdin'], content);
		plumb([
			'update-index',
			'--add',
			'--cacheinfo',
			`100644,${blob},${path}`,
		]);
	}
	const tree = plumb(['write-tree']);
	const commit = plumb([
		'commit-tree',
		tree,
		'-p',
		parent,
		'-m',
		options.message ?? 'feat: the unit',
	]);
	plumb(['update-ref', full, commit]);
	return commit;
};
