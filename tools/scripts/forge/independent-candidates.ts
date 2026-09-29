/**
 * independent-candidates.ts — which candidates can land without being
 * brought forward first (f00755).
 *
 * The queue used to land one candidate at a time: after each merge every
 * other candidate was behind, was brought forward (a merge commit), and
 * ran its checks again, twenty minutes each, before the next one could
 * land. Four green pull requests that touched nothing in common took
 * more than an hour, although none of them could affect another.
 *
 * A candidate's checks stay valid on the new integration branch when
 * nothing the integration branch gained since the candidate left it
 * reaches what the candidate's checks tested: no test zone in common, no
 * file in common, and neither side a change that can reach everything
 * (a root configuration file, a workflow). Such a candidate lands as it
 * is. Candidates are taken in queue order, and each is also checked
 * against the ones already taken, because they land on top of each other.
 * A candidate that overlaps is brought forward and tested again, as
 * before. The integration branch still runs every check after each merge.
 */
import type {
	IChangeFootprint,
	ICandidateAcceptance,
	IQueueCandidateChange,
} from './independent-candidates.interface';

const isEmpty = (footprint: IChangeFootprint): boolean =>
	footprint.files.size === 0 &&
	footprint.zones !== 'everything' &&
	footprint.zones.size === 0;

/** Why two changes may interact, or `undefined` when they cannot. */
export const overlapBetween = (
	a: IChangeFootprint,
	b: IChangeFootprint,
): string | undefined => {
	if (isEmpty(a) || isEmpty(b)) return undefined;
	const [left, right] = [a.zones, b.zones];
	if (left === 'everything' || right === 'everything') {
		return 'a change that can reach every zone';
	}
	const zones = [...left].filter((zone) => right.has(zone));
	if (zones.length > 0) return `the ${zones.join(', ')} zone(s)`;
	const files = [...a.files].filter((file) => b.files.has(file));
	if (files.length > 0) {
		return `${files.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${String(files.length - 3)} more` : ''}`;
	}
	return undefined;
};

/**
 * The candidates that can land now, in queue order: level ones, and ones
 * that touch nothing the integration branch changed under them; none of
 * them touching what an earlier accepted candidate touches.
 */
export const acceptIndependent = (
	candidates: readonly IQueueCandidateChange[],
): readonly ICandidateAcceptance[] => {
	const taken: IQueueCandidateChange[] = [];
	return candidates.map((candidate) => {
		const verdict = (
			accepted: boolean,
			why: string,
		): ICandidateAcceptance => {
			if (accepted) taken.push(candidate);
			return {
				number: candidate.number,
				headRef: candidate.headRef,
				accepted,
				why,
			};
		};
		for (const earlier of taken) {
			const overlap = overlapBetween(candidate.own, earlier.own);
			if (overlap !== undefined) {
				return verdict(
					false,
					`it and #${String(earlier.number)}, which lands first, both touch ${overlap}`,
				);
			}
		}
		if (candidate.level) {
			return verdict(true, 'level with the integration branch');
		}
		const overlap = overlapBetween(candidate.own, candidate.integration);
		return overlap === undefined
			? verdict(
					true,
					'behind, but nothing the integration branch gained since reaches what it changed',
				)
			: verdict(
					false,
					`behind, and the integration branch changed ${overlap} since it left`,
				);
	});
};
