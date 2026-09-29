/**
 * default-branch.ts — the branch a project integrates on, when it never
 * said.
 *
 * ## Why not "whatever HEAD is on"
 *
 * That was the first answer, and it is wrong in a way that is easy to
 * miss: it makes every check that depends on the integration branch
 * VACUOUS. "The shared checkout has not left the integration branch"
 * cannot fail if the integration branch is defined as wherever the
 * shared checkout currently is. The post-checkout warning that exists to
 * say "you have wandered" goes silent exactly when somebody wanders.
 *
 * The integration branch has to be a STABLE fact about the project, not
 * a reading of its current state.
 *
 * ## Why not `develop`
 *
 * That is this repository's habit, and a habit is not a default. A
 * project whose trunk is `main` was told its commits were refused
 * because the profile "anchors it to `develop`", and to return with
 * `git switch develop` — a branch it does not have. Adoption was
 * impossible for anyone not already shaped like us.
 *
 * ## What is stable and discoverable
 *
 * In order, stopping at the first that answers:
 *
 *  1. `refs/remotes/origin/HEAD` — the default branch the forge itself
 *     publishes. This is the real answer whenever there is a remote.
 *  2. `init.defaultBranch` from git's configuration, when a branch by
 *     that name exists here.
 *  3. Exactly ONE of the conventional trunks present locally. Two of
 *     them is ambiguity, and ambiguity is not an answer.
 *
 * When none answers, the caller is told so and decides. Guessing is what
 * produced the bug.
 */
import { execFileSync } from 'node:child_process';

import { CONVENTIONAL_TRUNKS } from './default-branch.constant';

const git = (root: string, args: readonly string[]): string => {
	try {
		return execFileSync('git', [...args], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return '';
	}
};

const exists = (root: string, branch: string): boolean =>
	git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
		.length > 0;

/**
 * The project's default branch, or `undefined` when nothing stable says.
 */
export const defaultBranchOf = (root: string): string | undefined => {
	const published = git(root, [
		'symbolic-ref',
		'--quiet',
		'--short',
		'refs/remotes/origin/HEAD',
	]);
	if (published.startsWith('origin/')) {
		return published.slice('origin/'.length);
	}
	const configured = git(root, ['config', '--get', 'init.defaultBranch']);
	if (configured.length > 0 && exists(root, configured)) return configured;
	const present = CONVENTIONAL_TRUNKS.filter((branch) =>
		exists(root, branch),
	);
	return present.length === 1 ? present[0] : undefined;
};
