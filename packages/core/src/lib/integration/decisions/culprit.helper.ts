/**
 * culprit.ts — who rides a batch, and which pull request turns it red.
 *
 * With the failing zones and specs known, the footprints of the members
 * say who owns the failure (`attributeCulprit`).
 */
import { TRAIN_CAPACITY } from './culprit.constant';
import type { ITrainCandidate } from './culprit.interface';
import type { IChangeFootprint } from './overlap.interface';

/**
 * The pull requests that ride the next batch: in order, none whose current
 * head was already labelled the culprit of a red batch, at most `capacity`.
 */
export const trainMembers = (
	candidates: readonly ITrainCandidate[],
	culprits: ReadonlyMap<number, string>,
	capacity: number = TRAIN_CAPACITY,
): readonly ITrainCandidate[] =>
	candidates
		.filter(
			(candidate) => culprits.get(candidate.number) !== candidate.headSha,
		)
		.slice(0, capacity);

/**
 * The member a failure belongs to, from the zones and specs that failed
 * against each member's footprint: the one member whose files include a
 * failing spec, or whose zones include a failing zone the others do not
 * reach. With no single owner there is no culprit, and `suspects` lists
 * every member that meets the failure.
 */
export const attributeCulprit = (input: {
	readonly failingZones: ReadonlySet<string>;
	readonly failingSpecs: ReadonlySet<string>;
	readonly members: readonly {
		readonly number: number;
		readonly own: IChangeFootprint;
	}[];
}): {
	readonly culprit?: number;
	readonly suspects: readonly number[];
} => {
	const meets = (footprint: IChangeFootprint): boolean =>
		[...input.failingSpecs].some((spec) => footprint.files.has(spec)) ||
		(footprint.zones === 'everything'
			? input.failingZones.size > 0
			: [...input.failingZones].some((zone) =>
					(footprint.zones as ReadonlySet<string>).has(zone),
				));
	const suspects = input.members
		.filter((member) => meets(member.own))
		.map((member) => member.number);
	const [only] = suspects;
	return suspects.length === 1 && only !== undefined
		? { culprit: only, suspects }
		: { suspects };
};
