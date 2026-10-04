/**
 * work-retire.service.ts — a unit that will not land is retired, not
 * left.
 *
 * After a review swarm, twenty-one branches sat on the forge holding
 * verdicts that could not merge: packs that conflicted, carried one
 * another, or signed one model three ways. The work-ref model had a way
 * in (`enter`), a way to land (`publish`) and a way to change hands
 * (`claim`), and no way out for work that lands nowhere. The only exit
 * was `git push --delete` by hand, which nothing checks and which loses
 * the work; so the branches stayed, every claim in them still held the
 * proposal it named, and the next review could not start.
 *
 * Retiring is that exit. The unit's tip is first written to a ref under
 * `refs/<namespace>/retired/` and pushed, so the work is kept on the
 * forge under a name no tool reads as a live unit; only then are its
 * branches removed. A unit is retired whole: its work ref and its
 * publication are one unit under two prefixes.
 */
import type { IRetirementPlan } from '../contracts/interfaces/work-retire.interface';

/** The namespace prefix as it appears in a branch name. */
const bare = (prefix: string): string =>
	prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');

/**
 * The names of the unit `branch` belongs to, or `undefined` when the
 * branch is under neither prefix: the integration branch, a release
 * branch and a person's own branch are never a unit to retire.
 */
export const planRetirement = (input: {
	readonly branch: string;
	readonly namespace: string;
	readonly workRefPrefix: string;
	readonly publicationRefPrefix: string;
}): IRetirementPlan | undefined => {
	const branch = bare(input.branch);
	const work = bare(input.workRefPrefix);
	const publication = bare(input.publicationRefPrefix);
	const prefix = [work, publication].find(
		(each) => each.length > 0 && branch.startsWith(each),
	);
	if (prefix === undefined) return undefined;
	const unit = branch.slice(prefix.length);
	if (unit.length === 0) return undefined;
	return {
		unit,
		workBranch: `${work}${unit}`,
		publicationBranch: `${publication}${unit}`,
		retiredRef: `refs/${input.namespace}/retired/${unit}`,
	};
};

/** How the work of a retired unit is brought back. */
export const restoreAdvice = (remote: string, retiredRef: string): string =>
	`git fetch ${remote} ${retiredRef} && git branch <name> FETCH_HEAD`;
