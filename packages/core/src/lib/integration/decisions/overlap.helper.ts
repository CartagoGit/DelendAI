/**
 * overlap.ts — the footprint of a change, where two footprints overlap, and
 * the groups ready pull requests fall into by overlap.
 *
 * A pull request's checks stay valid on the new integration branch when
 * nothing the branch gained since the pull request left it reaches what
 * its checks tested: no test zone in common, no file in common, and
 * neither side a change that can reach everything (a root configuration
 * file, a workflow). Such a pull request lands as it is; the ones that
 * overlap ride one batch whose run proves the combination.
 *
 * A zone in common is not always an overlap. Its specs may read files of
 * the repository from disk (the proposals, a generated catalog), and a
 * change to such a file reaches the zone without touching its code. Two
 * changes that meet only there, on different files, cannot change each
 * other's result short of a rule that reads all those files together;
 * that is left to the integration branch's own run.
 */
import type { IChangeFootprint } from './overlap.interface';

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
 * Why a batch tested on an older tip is stale, or `undefined` when the
 * integration branch moved only by what the batch does not reach: its
 * members still merge, and the tree they give is checked against what the
 * batch itself changed (`mergedFiles`). `batch` is what the batch changed
 * over the tip it was built on, `gained` what the branch gained since.
 */
export const staleAgainstTip = (
	batch: IChangeFootprint,
	gained: IChangeFootprint,
): string | undefined => overlapBetween(batch, gained);

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
