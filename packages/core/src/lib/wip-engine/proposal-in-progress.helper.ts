/**
 * proposal-in-progress.helper.ts — whether a work ref's proposal is still
 * in progress on the integration branch, read through a git runner.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { workUnitIdentityOf } from '../development-policy/git-guard-unit';

/**
 * Whether the unit's proposal is in progress on the integration branch. Its
 * work ref outlives each pull request until the proposal leaves progress:
 * withdrawn after every landed slice, the forge showed an in-progress
 * proposal with no unit, and the queue's doctor reddened the integration
 * branch on it.
 */
export const proposalStillInProgress = async (
	run: IGitRunner,
	policy: IResolvedDevelopmentPolicy,
	ref: string,
): Promise<boolean> => {
	const identity = workUnitIdentityOf(
		policy,
		ref.replace(/^refs\/heads\//u, ''),
	);
	if (identity === undefined) return false;
	const tree = await run([
		'ls-tree',
		'-r',
		'--name-only',
		`refs/heads/${policy.branches.integration}`,
	]);
	return (
		tree.ok &&
		tree.output
			.split('\n')
			.some(
				(file) =>
					file.includes('/proposals/in-progress/') &&
					(file.split('/').pop() ?? '').startsWith(
						`${identity.proposal}-`,
					),
			)
	);
};
