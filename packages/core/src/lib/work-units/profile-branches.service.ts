/**
 * profile-branches.service.ts — every branch of the clone is one the
 * development profile knows.
 *
 * A profile names where work lives: the integration and release
 * branches, the work and publication namespaces, the automation it
 * leaves alone. Change the profile (or its prefixes) and the branches the
 * old one made stay behind under names the new one never reads: no unit
 * listing shows them, no reaper touches them, and they hold work nobody
 * is told about. The ref reconciler already says which names are outside
 * every namespace (`unmanaged`); this asks it of the clone's own
 * branches and reports each one.
 */
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { reconcileRefs } from '../ref-lifecycle/reconcile.service';

/** The local branches no namespace of `policy` accounts for. */
export const branchesOutsideTheProfile = (
	branches: readonly string[],
	policy: IResolvedDevelopmentPolicy,
): readonly string[] =>
	reconcileRefs(
		branches.map((name) => ({ name })),
		[],
		policy.branches,
	)
		.verdicts.filter((verdict) => verdict.role === 'unmanaged')
		.map((verdict) => verdict.name);

export const profileBranchesInvariant = (input: {
	readonly branches: readonly string[];
	readonly policy: IResolvedDevelopmentPolicy;
}): IInvariantResult => {
	const outside = branchesOutsideTheProfile(input.branches, input.policy);
	return {
		scope: 'checkout',
		id: 'branches-in-the-profile',
		claim: 'every branch is one the development profile knows',
		holds: outside.length === 0,
		observed:
			outside.length === 0
				? 'none'
				: `${String(outside.length)}: ${outside.slice(0, 3).join(', ')}`,
		remedy: `a branch an earlier profile or a person made: if it carries work, enter a unit (\`delendai work enter\`), merge the branch into it and publish; then delete the branch (\`git branch -D <name>\`). Work lives under \`${input.policy.branches.workRefPrefix}\``,
	};
};
