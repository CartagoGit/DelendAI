import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { integrationRemote, readGit } from './work-unit-shared.service';
import { planRetirement } from './work-retire.service';

/**
 * The commit a new work ref starts from: the integration base, unless the
 * unit it names still has a publication on the forge that has not landed
 * (a pull request waiting on a conflict or a red check). Then the unit
 * continues from that publication. Started from the integration base, a
 * unit re-entered to fix its own pull request held none of its commits,
 * and its next publish replaced them with work that never had them.
 */
export const unitStartPoint = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	/** The new unit's branch, without `refs/heads/`. */
	readonly branch: string;
	readonly base: string;
}): string => {
	const { root, policy, base } = input;
	const plan = planRetirement({
		branch: input.branch,
		namespace: policy.branches.namespacePrefix,
		workRefPrefix: policy.branches.workRefPrefix,
		publicationRefPrefix: policy.branches.publicationRefPrefix,
	});
	if (plan === undefined) return base;
	const remote = integrationRemote(root, policy);
	const published = `refs/heads/${plan.publicationBranch}`;
	const [tip = ''] = (
		readGit(root, ['ls-remote', '--', remote, published]) ?? ''
	).split(/\s/u);
	if (tip.length === 0) return base;
	if (readGit(root, ['fetch', '-q', remote, published]) === undefined) {
		return base;
	}
	const landed =
		readGit(root, ['merge-base', '--is-ancestor', tip, base]) !== undefined;
	return landed ? base : tip;
};

/**
 * Creates the work ref `ref` at its start point, by plumbing: no checkout
 * moves. `false` when git refused.
 */
export const createUnitRef = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly ref: string;
	readonly branch: string;
	readonly base: string;
}): boolean =>
	readGit(input.root, ['update-ref', input.ref, unitStartPoint(input)]) !==
	undefined;
