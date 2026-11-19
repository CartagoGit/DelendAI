/**
 * land-revert-git.service.ts — `ILandRevertGit` on a real clone. The revert
 * of a merge (`git revert -m 1`) is built in a throwaway worktree over the
 * tip, its derived files regenerated once like a batch's, and pushed as the
 * identity. A conflicting revert pushes nothing.
 */
// effect-boundary-authorized: the integrator's git adapter; a revert is built by git in a throwaway worktree
import { execFileSync } from 'node:child_process';

import type { ILandRevertBuild, ILandRevertGit } from '@delendai/core/cli';

import {
	BATCH_COMMIT_IDENTITY,
	BATCH_REGENERATION_SUBJECT,
} from '../contracts/constants/integration-pass.constant';
import type { IGitExec } from '../contracts/interfaces/integration-pass.interface';

import { identityFetchEnv, pushAsIdentity } from './land-identity-push.helper';
import { discardTrain, runGit } from './land-train-assembly.helper';

export const createRevertGit = (input: {
	readonly root: string;
	readonly remote: string;
	readonly token: string;
	/** Rebuild the derived files in a tree; false when it failed. */
	readonly regenerate: (dir: string) => boolean;
	readonly exec?: IGitExec;
}): ILandRevertGit => {
	const { root, remote, token } = input;
	const exec = input.exec ?? runGit;
	const fetchEnv = identityFetchEnv(token);
	const attempt = (cwd: string, args: readonly string[]): boolean => {
		try {
			exec(cwd, args);
			return true;
		} catch {
			return false;
		}
	};
	return {
		revertMerge: ({ ref, tip, merge }): ILandRevertBuild => {
			const scratch = execFileSync(
				'mktemp',
				['-d', '-t', 'delendai-revert.XXXXXX'],
				{ encoding: 'utf8' },
			).trim();
			try {
				for (const sha of [tip, merge.sha]) {
					try {
						exec(root, ['cat-file', '-e', `${sha}^{commit}`]);
					} catch {
						exec(
							root,
							['fetch', '-q', '--', remote, sha],
							fetchEnv,
						);
					}
				}
				exec(root, [
					'worktree',
					'add',
					'--quiet',
					'--detach',
					scratch,
					tip,
				]);
				const identity = [...BATCH_COMMIT_IDENTITY];
				if (
					!attempt(scratch, [
						...identity,
						'revert',
						'-m',
						'1',
						'--no-edit',
						merge.sha,
					])
				) {
					attempt(scratch, ['revert', '--abort']);
					return { kind: 'conflict' };
				}
				if (!input.regenerate(scratch))
					return {
						kind: 'failed',
						reason: 'regenerating the derived files failed',
					};
				if (exec(scratch, ['status', '--porcelain']).length > 0) {
					exec(scratch, ['add', '-A']);
					exec(scratch, [
						...identity,
						'commit',
						'-q',
						'-m',
						BATCH_REGENERATION_SUBJECT,
					]);
				}
				const failure = pushAsIdentity({
					cwd: scratch,
					remote,
					refspec: `HEAD:refs/heads/${ref}`,
					token,
					force: true,
				});
				return failure === undefined
					? {
							kind: 'built',
							sha: exec(scratch, ['rev-parse', 'HEAD']),
						}
					: { kind: 'failed', reason: failure };
			} catch (error) {
				return {
					kind: 'failed',
					reason:
						error instanceof Error ? error.message : String(error),
				};
			} finally {
				discardTrain(root, scratch);
			}
		},
	};
};
