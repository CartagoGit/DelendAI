/**
 * unit-push.service.ts — a commit on a unit's branch is on the forge at once.
 *
 * `persistence.autoPushAfterCommit` is on in every profile, but only the
 * WIP engine's checkpoints honoured it: a `git commit` in a unit's
 * worktree, which is how agents work, stayed on the machine until the
 * unit was published. Work done on one computer was then missing on the
 * next, and done twice. The guard's `post-commit` and `post-merge` hooks
 * call this, so whatever made the commit, the branch on the forge follows.
 * A push the forge refuses (the branch moved elsewhere) is reported with
 * the command that reconciles it; nothing is ever forced.
 */
import { execFileSync } from 'node:child_process';

import { DURABILITY_PUSH_VARIABLE } from '../contracts/constants/durability-push.constant';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IUnitPush } from '../contracts/interfaces/unit-push.interface';
import { integrationRemote } from './work-unit-shared.service';

const workBranchPrefix = (policy: IResolvedDevelopmentPolicy): string =>
	policy.branches.workRefPrefix
		.replace(/^refs\//u, '')
		.replace(/^heads\//u, '');

/** A check's own verdict in a refused push's output: the best reason. */
const VERDICT_LINE = /✖|✗|\bblocked\b|exited with code/iu;

/** Any line that reads as a failure, git's own included. */
const FAILURE_LINE =
	/\berror\b|\brejected\b|\brefused\b|\bfatal\b|\bfailed\b/iu;

/**
 * The line of a refused push's output that says why. The first line was
 * reported, and a pre-push hook prints the command it is about to run
 * first: "refused it ($ bun …push-to-develop-discipline…)" blamed a check
 * that had passed, and hid the one that failed. A check's last verdict
 * (✖, blocked) is the reason, then git's last failure line, then the last
 * line said.
 */
export const failureLineOf = (stderr: string): string => {
	const lines = stderr
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith('$ '));
	const latest = [...lines].reverse();
	return (
		latest.find((line) => VERDICT_LINE.test(line)) ??
		latest.find((line) => FAILURE_LINE.test(line)) ??
		lines.at(-1) ??
		stderr.trim()
	);
};

/** Push `branch`, checked out in a linked worktree at `cwd`, to the same name on the forge. */
export const pushUnitTip = (input: {
	readonly cwd: string;
	readonly branch: string | undefined;
	readonly inMainWorktree: boolean;
	readonly policy: IResolvedDevelopmentPolicy;
}): IUnitPush => {
	const { cwd, branch, policy } = input;
	if (!policy.persistence.autoPushAfterCommit)
		return { status: 'skipped', reason: 'autoPushAfterCommit is off' };
	const prefix = workBranchPrefix(policy);
	if (
		input.inMainWorktree ||
		branch === undefined ||
		prefix.length === 0 ||
		!branch.startsWith(prefix)
	)
		return {
			status: 'skipped',
			reason: 'not a unit branch in its worktree',
		};
	const remote = integrationRemote(cwd, policy);
	try {
		execFileSync(
			'git',
			[
				'push',
				'--quiet',
				'--set-upstream',
				remote,
				`refs/heads/${branch}:refs/heads/${branch}`,
			],
			{
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				env: { ...process.env, [DURABILITY_PUSH_VARIABLE]: '1' },
			},
		);
		return { status: 'pushed', branch, remote };
	} catch (error) {
		const stderr =
			typeof error === 'object' && error !== null && 'stderr' in error
				? String((error as { stderr?: unknown }).stderr ?? '').trim()
				: String(error);
		return {
			status: 'refused',
			branch,
			remote,
			detail: failureLineOf(stderr),
			repair: `git fetch ${remote} ${branch} && git merge FETCH_HEAD && git push ${remote} ${branch}`,
		};
	}
};
