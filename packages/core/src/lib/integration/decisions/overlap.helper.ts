/**
 * overlap.ts — the footprint of a change, where two footprints overlap, which
 * candidates can land without being brought forward first (f00755), and the
 * groups ready pull requests fall into by overlap.
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
 * before. Zone overlap decides only this, landing WITHOUT a run: a train
 * runs the combination, so its riders are never split by it.
 *
 * A zone in common is not always an overlap. Its specs may read files of
 * the repository from disk (the proposals, a generated catalog), and a
 * change to such a file reaches the zone without touching its code. Two
 * candidates that meet only there, on different files, cannot change each
 * other's result short of a rule that reads all those files together;
 * that is left to the integration branch's own run. With eleven reviewers
 * publishing verdicts, treating it as an overlap ran every pack's checks
 * again after every other pack landed.
 */
import type {
	IChangeFootprint,
	ITrainPriority,
	ICandidateAcceptance,
	IQueueCandidateChange,
} from './overlap.interface';

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
	const shared = [...left].filter((zone) => right.has(zone));
	// A zone both reach only by being read: neither changed its code, each
	// changed a file its specs open. Two verdicts on two proposals meet
	// there and nowhere else, and each used to wait for the other's whole
	// run. They are apart unless they change one file, or both add a new
	// one, which is how two documents come to carry one number.
	const read = (zone: string): boolean =>
		a.readOnly?.has(zone) === true && b.readOnly?.has(zone) === true;
	// A zone one side only feeds with files (a review batch's proposals)
	// is reached there by the specs that read them, not by the zone: the
	// two meet only where the other side edits one of those specs. Unknown
	// readers keep the answer by zone.
	const fedApart = (zone: string): boolean => {
		const feeder =
			a.readOnly?.has(zone) === true
				? a
				: b.readOnly?.has(zone) === true
					? b
					: undefined;
		if (feeder?.readers === undefined) return false;
		const other = feeder === a ? b : a;
		return ![...feeder.readers].some((spec) => other.files.has(spec));
	};
	const zones = shared.filter((zone) => !read(zone) && !fedApart(zone));
	if (zones.length > 0) return `the ${zones.join(', ')} zone(s)`;
	const files = [...a.files].filter((file) => b.files.has(file));
	if (files.length > 0) {
		return `${files.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${String(files.length - 3)} more` : ''}`;
	}
	if (shared.length > 0 && a.creates !== false && b.creates !== false) {
		return `new files read by the ${shared.join(', ')} zone(s)`;
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

const RANK: Readonly<Record<ITrainPriority, number>> = {
	urgent: 0,
	normal: 1,
	review: 2,
};

/** A review batch, read off its publication's kind: `<prefix><agent>/review/…`. */
export const isReviewBatch = (headRef: string): boolean =>
	headRef.split('/').includes('review');

/**
 * The candidates that ride the next train: every one, in train order. A
 * zone or a file two riders share is no reason to split them: the train
 * runs the combination, the union of their sections once, so it proves
 * exactly what the overlap put in doubt. Only a textual conflict outside
 * the derived files keeps a rider off, and that is learned when the train
 * is assembled. Being behind is no reason either: the train is the
 * integration tip with each rider merged onto it. An urgent repair leads,
 * ahead of review batches; the rest keep queue order.
 */
export const acceptRiders = (
	candidates: readonly IQueueCandidateChange[],
	priorityOf: (candidate: IQueueCandidateChange) => ITrainPriority = (
		candidate,
	) => (isReviewBatch(candidate.headRef) ? 'review' : 'normal'),
): readonly ICandidateAcceptance[] =>
	candidates
		.map((candidate, index) => ({
			candidate,
			index,
			priority: priorityOf(candidate),
		}))
		.sort(
			(a, b) => RANK[a.priority] - RANK[b.priority] || a.index - b.index,
		)
		.map(({ candidate, priority }) => ({
			number: candidate.number,
			headRef: candidate.headRef,
			accepted: true,
			why:
				priority === 'urgent'
					? 'an urgent repair: it leads the train'
					: candidate.level
						? 'level with the integration branch; the train runs it with the others'
						: 'behind; the train proves it against the integration tip, with the others',
		}));

/** A change's footprint, from the files it touches and what the CI selection reaches. */
export const footprintFromReach = (input: {
	readonly files: ReadonlySet<string>;
	/** What the CI selection (`zoneReach`) reaches; `undefined` when it cannot bound it. */
	readonly reach?:
		| {
				readonly zones: ReadonlySet<string>;
				readonly readOnly: ReadonlySet<string>;
				readonly readers?: ReadonlyMap<string, readonly string[]>;
		  }
		| undefined;
	/** The change adds a file that existed nowhere before. */
	readonly creates: boolean;
}): IChangeFootprint => {
	const { files, reach } = input;
	if (files.size === 0) return { zones: new Set(), files };
	if (reach === undefined) return { zones: 'everything', files };
	return {
		zones: reach.zones,
		files,
		readOnly: reach.readOnly,
		// What a change that only feeds a zone reaches there: the specs
		// that read its files, never the whole zone.
		readers: new Set(
			[...reach.readOnly].flatMap(
				(zone) => reach.readers?.get(zone) ?? [],
			),
		),
		creates: input.creates,
	};
};

/**
 * The ready pull requests grouped by overlap: two members are in one
 * group when their footprints overlap, directly or through a third.
 * Groups that share nothing can proceed in parallel; members keep the
 * order given, and groups are ordered by their first member.
 */
export const groupByOverlap = <T extends { readonly own: IChangeFootprint }>(
	members: readonly T[],
): readonly (readonly T[])[] => {
	const root = members.map((_, index) => index);
	const find = (index: number): number => {
		let at = index;
		while (root[at] !== at) at = root[at] ?? at;
		return at;
	};
	for (let i = 0; i < members.length; i++) {
		for (let j = i + 1; j < members.length; j++) {
			const [a, b] = [members[i], members[j]];
			if (
				a !== undefined &&
				b !== undefined &&
				overlapBetween(a.own, b.own) !== undefined
			) {
				root[find(j)] = find(i);
			}
		}
	}
	const groups = new Map<number, T[]>();
	members.forEach((member, index) => {
		const key = find(index);
		groups.set(key, [...(groups.get(key) ?? []), member]);
	});
	return [...groups.values()];
};
