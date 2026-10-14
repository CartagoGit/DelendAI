/**
 * stranded-proposals.service.ts — a proposal in progress has a unit.
 *
 * In progress is the one state that keeps a work branch: every commit on
 * it is pushed, and leaving the state publishes what it holds. A proposal
 * whose every slice had landed sat in `in-progress/` with no branch, no
 * worktree and no pull request anywhere, because the unit was published
 * while it was still in progress and later reaped as delivered. Nobody
 * was working on it, and it read as work under way.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';
import { workUnitIdentityOf } from '../development-policy/git-guard-unit';

/** The namespace prefix as it appears in a branch name, without `refs/`. */
const bare = (prefix: string): string =>
	prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** The proposal ids a tree holds under `in-progress/`. */
export const inProgressProposals = (paths: readonly string[]): string[] =>
	paths.flatMap((path) => {
		const match = /\/proposals\/in-progress\/([a-z]\d{5})-[^/]*\.md$/u.exec(
			path,
		);
		return match?.[1] === undefined ? [] : [match[1]];
	});

/**
 * The invariant, from the proposals in progress on the integration branch
 * and every branch name there is, here and on the forge.
 */
export const strandedProposalsInvariant = (input: {
	readonly policy: Pick<IResolvedDevelopmentPolicy, 'branches'>;
	readonly inProgress: readonly string[];
	readonly branches: readonly string[];
}): IInvariantResult => {
	const work = bare(input.policy.branches.workRefPrefix);
	const publication = bare(input.policy.branches.publicationRefPrefix);
	const held = new Set(
		input.branches.flatMap((branch) => {
			const asWork = branch.startsWith(publication)
				? `${work}${branch.slice(publication.length)}`
				: branch;
			const proposal = workUnitIdentityOf(input.policy, asWork)?.proposal;
			return proposal === undefined ? [] : [proposal];
		}),
	);
	const stranded = [...new Set(input.inProgress)]
		.filter((proposal) => !held.has(proposal))
		.sort();
	return {
		scope: 'forge',
		id: 'proposals-have-units',
		claim: 'every proposal in progress has a unit, here or on the forge',
		holds: stranded.length === 0,
		observed:
			stranded.length === 0
				? 'all held'
				: `${String(stranded.length)} with no unit: ${stranded.slice(0, 5).join(', ')}`,
		remedy: 'enter it again to go on (`delendai work enter --proposal=<id>`), or move it where it stands with `proposal_transition` (review, ready, blocked or paused)',
	};
};
