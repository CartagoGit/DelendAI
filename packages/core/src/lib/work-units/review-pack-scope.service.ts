/**
 * review-pack-scope.service.ts — a review pack carries its own verdicts.
 *
 * Reviewers started their packs from one another's, or merged a
 * neighbour's in to "catch up". Seven open pull requests then carried the
 * same verdict commits in different combinations: whichever merged first
 * turned the rest into conflicts, and no pull request said which verdicts
 * were its author's.
 *
 * A pack is its own commits over the integration branch. One that shares
 * a commit with another agent's pack still waiting to land is carrying
 * that pack, and is told which.
 */
import type { ISwarmUnit } from '../contracts/interfaces/work-swarm.interface';

/** Unit kinds that record verdicts. */
const REVIEW_KIND = 'review';

/** Another pack, and what it holds over the integration branch. */
export interface IReviewPackCommits {
	readonly ref: string;
	readonly commits: readonly string[];
}

/** A pack this one carries, and how much of it. */
export interface ICarriedPack {
	readonly ref: string;
	readonly shared: number;
}

/**
 * The review packs of OTHER agents among the swarm's units: the ones this
 * pack may not carry. The agent's own packs are its own work, however
 * many generations of them wait.
 */
export const otherReviewPacks = (
	units: readonly ISwarmUnit[],
	agent: string,
): readonly ISwarmUnit[] =>
	units.filter(
		(unit) =>
			unit.agent !== agent &&
			unit.ahead > 0 &&
			unit.subject.split('/')[0] === REVIEW_KIND,
	);

/** The packs that hold a commit of this one, most shared first. */
export const packsCarried = (
	own: readonly string[],
	packs: readonly IReviewPackCommits[],
): readonly ICarriedPack[] => {
	const mine = new Set(own);
	return packs
		.map((pack) => ({
			ref: pack.ref,
			shared: pack.commits.filter((commit) => mine.has(commit)).length,
		}))
		.filter((pack) => pack.shared > 0)
		.sort((left, right) => right.shared - left.shared);
};

/** What a reviewer publishing somebody else's verdicts is told. */
export const describeCarriedPacks = (
	carried: readonly ICarriedPack[],
	integration: string,
): string =>
	[
		...carried.map(
			(pack) =>
				`  ${pack.ref} already carries ${String(pack.shared)} of its commit(s)`,
		),
		'',
		`A pack starts from \`${integration}\` and holds only what its reviewer recorded. Enter a fresh review unit and record your verdicts there; the other pack lands on its own.`,
	].join('\n');
