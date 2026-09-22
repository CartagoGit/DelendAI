/**
 * shared-checkout.ts — which working copy the project's facts belong to.
 *
 * A project has ONE pinned checkout and any number of worktrees hanging
 * off it. Facts about the project — which branch integrates, whether the
 * checkout is clean, where the refs live — are facts about that one
 * checkout, and asking the worktree you happen to be standing in gives
 * the wrong answer for every one of them.
 *
 * `--show-toplevel` answers the worktree. `--git-common-dir` is the one
 * path that is the same from either, so its parent is always the shared
 * checkout.
 *
 * ## Why here
 *
 * This was written four times — in the guard, in the workflow doctor, in
 * the proposals reconciler and in the id-counter source — each with its
 * own spelling and its own failure mode. One of them read `.git` as a
 * directory and silently degraded in every worktree, which is the
 * ordinary case. A question with one answer should have one
 * implementation.
 */
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';

/**
 * The git directory shared by a checkout and all of its worktrees, or
 * `undefined` when `from` is not inside a git working tree.
 *
 * Not published: `sharedCheckout` is the question callers ask, and a
 * published export is a compatibility commitment nobody has asked for.
 */
const commonGitDir = (from: string): string | undefined => {
	try {
		const answer = execFileSync(
			'git',
			['rev-parse', '--path-format=absolute', '--git-common-dir'],
			{
				cwd: from,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			},
		).trim();
		return answer.length === 0 ? undefined : answer;
	} catch {
		return undefined;
	}
};

/**
 * The pinned checkout, from anywhere inside the repository — including
 * from a linked worktree, which is where agents work.
 */
export const sharedCheckout = (from: string): string | undefined => {
	const common = commonGitDir(from);
	return common === undefined ? undefined : dirname(common);
};
