/**
 * proposal-in-progress.helper.ts — where a work ref's proposal stands, at
 * the ref's tip and on the integration branch, read through a git runner.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type { IWorkRefFacts } from '../contracts/interfaces/work-ref-lifecycle.interface';
import { workUnitIdentityOf } from '../development-policy/git-guard-unit';
import { inProgressProposals } from '../work-units/publication-target.service';

const inProgressAt = async (
	run: IGitRunner,
	treeish: string,
	proposal: string,
): Promise<boolean> => {
	const tree = await run(['ls-tree', '-r', '--name-only', treeish]);
	return (
		tree.ok &&
		inProgressProposals(tree.output.split('\n')).includes(proposal)
	);
};

/**
 * The two readings the work-ref rule takes of the unit's proposal; both
 * false for a ref that names no unit. The tip defaults to the ref and the
 * integration reading to the local integration branch; a caller judging a
 * remote ref, or against an integration commit it already holds, names
 * them.
 */
export const workRefOpennessOf = async (
	run: IGitRunner,
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
	ref: string,
	at: { readonly tip?: string; readonly integration?: string } = {},
): Promise<Pick<IWorkRefFacts, 'openAtTip' | 'openOnIntegration'>> => {
	const identity = workUnitIdentityOf(
		policy,
		ref.replace(/^refs\/heads\//u, ''),
	);
	if (identity === undefined) {
		return { openAtTip: false, openOnIntegration: false };
	}
	return {
		openAtTip: await inProgressAt(run, at.tip ?? ref, identity.proposal),
		openOnIntegration: await inProgressAt(
			run,
			at.integration ?? `refs/heads/${policy.branches.integration}`,
			identity.proposal,
		),
	};
};
