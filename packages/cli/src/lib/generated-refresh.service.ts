/**
 * generated-refresh.service.ts — after a merge, the generated files are
 * recomputed from the tree that actually landed.
 *
 * WHY this is separate from the merge driver: git calls a merge driver
 * per conflicted FILE, while the merge is still in progress and the tree
 * is incomplete. A generator run there produces a file computed from half
 * a tree — no conflict, but a count that is subtly wrong, which
 * `check:generated` then fails on. The driver's job is to end the
 * conflict; this one's job is to make the result true, and it can only
 * run once the merge is finished.
 *
 * WHY it writes a commit instead of leaving the worktree dirty: a merge
 * that silently leaves modified files behind is how an unrelated change
 * gets swept into somebody else's next commit. The refresh is its own
 * commit, touching only the generated paths, and it is a no-op when the
 * generators produce what is already there.
 */
import { execFileSync } from 'node:child_process';

import { GENERATED_REFRESH_COMMANDS } from '../contracts/constants/generated-refresh.constant';
import type { IGeneratedRefreshReport } from '../contracts/interfaces/generated-refresh.interface';

export type { IGeneratedRefreshReport } from '../contracts/interfaces/generated-refresh.interface';
export { GENERATED_REFRESH_COMMANDS } from '../contracts/constants/generated-refresh.constant';

const git = (
	cwd: string,
	args: readonly string[],
): { readonly ok: boolean; readonly out: string } => {
	try {
		return {
			ok: true,
			out: execFileSync('git', args, {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			}).trim(),
		};
	} catch {
		return { ok: false, out: '' };
	}
};

/**
 * Re-run the generators and commit whatever they changed.
 *
 * `paths` bounds the commit: anything the generators touch outside them
 * is left alone rather than swept in, because a refresh that can commit
 * arbitrary files is a refresh that can commit somebody else's work.
 */
export const refreshGeneratedAfterMerge = (input: {
	readonly root: string;
	readonly paths: readonly string[];
	readonly run?: (command: string, cwd: string) => boolean;
}): IGeneratedRefreshReport => {
	const run =
		input.run ??
		((command: string, cwd: string): boolean => {
			try {
				execFileSync('bun', ['run', command], {
					cwd,
					stdio: ['ignore', 'ignore', 'pipe'],
				});
				return true;
			} catch {
				return false;
			}
		});
	const failed: string[] = [];
	for (const command of GENERATED_REFRESH_COMMANDS) {
		if (!run(command, input.root)) failed.push(command);
	}
	const dirty = git(input.root, [
		'status',
		'--porcelain=v1',
		'--',
		...input.paths,
	]);
	if (!dirty.ok) {
		return { refreshed: false, committed: false, failed, paths: [] };
	}
	const changed = dirty.out
		.split('\n')
		.map((line) => line.slice(3).trim())
		.filter((path) => path.length > 0);
	if (changed.length === 0) {
		return { refreshed: true, committed: false, failed, paths: [] };
	}
	const staged = git(input.root, ['add', '--', ...changed]);
	const committed =
		staged.ok &&
		// No `--no-verify`: this commit goes through the same hooks as any
		// other. In an agent's worktree, on its work ref, the policy
		// allows it; anywhere the policy refuses it, the refusal is the
		// right answer and `committed: false` says so.
		git(input.root, [
			'commit',
			'-m',
			'chore(generated): recompute after a merge',
		]).ok;
	return { refreshed: true, committed, failed, paths: changed };
};
