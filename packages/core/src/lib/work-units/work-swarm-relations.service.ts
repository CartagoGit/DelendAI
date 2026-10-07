/**
 * work-swarm-relations.service.ts — what the units of work in a swarm
 * have to sort out between themselves, and the swarm as text.
 *
 * Pure over units `readSwarm` already read: stacks, duplicates, landed
 * publications and overlaps are decided here, where a test can ask any
 * question without a repository.
 */
import type {
	ISwarmRelation,
	ISwarmUnit,
	ISwarmView,
} from '../contracts/interfaces/work-swarm.interface';

/**
 * Share of the smaller unit's paths two independent units must have in
 * common before running them at once is called out. Measured on the
 * swarm of 2026-09-30: the pairs that cost a refresh round each were all
 * above 0.9; unrelated pairs stayed under 0.15.
 */
const HIGH_OVERLAP_RATIO = 0.6;

/**
 * Overlapping paths the text view lists before it summarises: a stack of
 * three units shares dozens, and listing them all buried the relations
 * that say what to do about it.
 */
const LISTED_OVERLAPS = 10;

/**
 * The proposal slice and generation a unit's subject names, when it
 * follows `<kind>/<proposal>-<slice>-g<n>/<topic>`.
 */
export const unitKeyOf = (
	subject: string,
): { readonly slice: string; readonly generation: string } | undefined => {
	const match = /(?:^|\/)([^/]+)-g(\d+)(?:\/|$)/u.exec(subject);
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	return { slice: match[1], generation: match[2] };
};

const pairs = <T>(items: readonly T[]): readonly (readonly [T, T])[] =>
	items.flatMap((left, index) =>
		items.slice(index + 1).map((right) => [left, right] as const),
	);

/**
 * What the units of work have to sort out between themselves, worst
 * first. Pure over the units and one question to git — how many unlanded
 * commits two tips share — so a test can ask it anything.
 */
export const relationsOf = (input: {
	readonly units: readonly ISwarmUnit[];
	readonly published: readonly ISwarmUnit[];
	readonly sharedUnlanded: (left: ISwarmUnit, right: ISwarmUnit) => number;
}): readonly ISwarmRelation[] => {
	const landed = input.published.filter((unit) => unit.ahead === 0);
	const live = [
		...input.units,
		...input.published.filter((unit) => unit.ahead > 0),
	];
	const relations: ISwarmRelation[] = landed.map((unit) => ({
		kind: 'landed',
		refs: [unit.ref],
		detail: 'every commit is already integrated; the ref can be deleted',
	}));

	const bySlice = new Map<string, ISwarmUnit[]>();
	for (const unit of live) {
		const key = unitKeyOf(unit.subject);
		if (key === undefined) continue;
		bySlice.set(key.slice, [...(bySlice.get(key.slice) ?? []), unit]);
	}
	const sameSlice = (left: ISwarmUnit, right: ISwarmUnit): boolean =>
		unitKeyOf(left.subject)?.slice !== undefined &&
		unitKeyOf(left.subject)?.slice === unitKeyOf(right.subject)?.slice;
	for (const [slice, holders] of bySlice) {
		// One agent's work ref beside its own publication of the same
		// generation is that agent updating its pull request, not a copy.
		const owners = new Set(
			holders.map(
				(unit) =>
					`${unit.agent}#${unitKeyOf(unit.subject)?.generation ?? ''}`,
			),
		);
		if (owners.size > 1) {
			relations.push({
				kind: 'duplicate',
				refs: holders.map((unit) => unit.ref),
				detail: `${slice} is live ${String(owners.size)} times; keep one`,
			});
		}
	}

	for (const [left, right] of pairs(live)) {
		if (sameSlice(left, right)) continue;
		const shared = input.sharedUnlanded(left, right);
		if (shared > 0) {
			relations.push({
				kind: 'stacked',
				refs: [left.ref, right.ref],
				detail: `${String(shared)} unlanded commit(s) in common: land the base first, then refresh the other`,
			});
			continue;
		}
		const smaller = Math.min(left.paths.length, right.paths.length);
		if (smaller === 0) continue;
		const common = left.paths.filter((path) =>
			right.paths.includes(path),
		).length;
		if (common / smaller >= HIGH_OVERLAP_RATIO) {
			relations.push({
				kind: 'overlap',
				refs: [left.ref, right.ref],
				detail: `${String(common)} of ${String(smaller)} path(s) in common: run them one after the other`,
			});
		}
	}
	// A unit with work of its own whose base moved: nothing brings it
	// forward but its agent, and the conflicts it is gathering surface
	// only when it publishes. One that holds nothing is brought forward
	// when it is entered again; a publication, by the queue.
	for (const unit of input.units) {
		if (unit.ahead === 0 || unit.behind === 0) continue;
		relations.push({
			kind: 'behind',
			refs: [unit.ref],
			detail: `its base moved ${String(unit.behind)} commit(s) on: in its worktree, merge the integration branch into it (\`git merge <remote>/<integration>\`) before it publishes`,
		});
	}
	return relations;
};

/** Whether two refs carry one unit: same agent, slice and generation. */
const sameUnit = (left: ISwarmUnit, right: ISwarmUnit): boolean => {
	const leftKey = unitKeyOf(left.subject);
	const rightKey = unitKeyOf(right.subject);
	return (
		left.agent === right.agent &&
		leftKey !== undefined &&
		leftKey.slice === rightKey?.slice &&
		leftKey.generation === rightKey.generation
	);
};

/**
 * The publications that have not landed, less those whose own work ref is
 * still live. An agent updating its pull request has both, and counting
 * the pair as two units reported every path of that one unit as an
 * overlap: 42 paths of noise in the view meant to show real collisions.
 * The work ref is the newer copy, so it is the one kept.
 */
export const unlandedElsewhere = (
	units: readonly ISwarmUnit[],
	published: readonly ISwarmUnit[],
): readonly ISwarmUnit[] =>
	published.filter(
		(publication) =>
			publication.ahead > 0 &&
			!units.some((unit) => sameUnit(unit, publication)),
	);

/** The swarm as lines a person reads. */
export const describeSwarm = (view: ISwarmView): readonly string[] => [
	`integration      ${view.integration}`,
	`units of work    ${String(view.units.length)}`,
	...view.units.map(
		(unit) =>
			`  ${unit.agent}  ${unit.subject}  +${String(unit.ahead)}/-${String(unit.behind)}  ${String(unit.paths.length)} path(s)`,
	),
	`publications     ${String(view.published.length)}`,
	...view.published.map(
		(unit) =>
			`  ${unit.agent}  ${unit.subject}  +${String(unit.ahead)}/-${String(unit.behind)}  ${String(unit.paths.length)} path(s)`,
	),
	...(view.overlaps.length === 0
		? ['overlaps         none']
		: [
				`overlaps         ${String(view.overlaps.length)} path(s) more than one unit of work is changing:`,
				...view.overlaps
					.slice(0, LISTED_OVERLAPS)
					.map(
						(overlap) =>
							`  ${overlap.path} — ${String(overlap.refs.length)} units`,
					),
				...(view.overlaps.length > LISTED_OVERLAPS
					? [
							`  … ${String(view.overlaps.length - LISTED_OVERLAPS)} more; --json lists every path and unit`,
						]
					: []),
			]),
	...(view.relations.length === 0
		? ['to sort out      nothing']
		: [
				`to sort out      ${String(view.relations.length)}:`,
				...view.relations.flatMap((relation) => [
					`  ${relation.kind.padEnd(9)} ${relation.detail}`,
					...relation.refs.map((ref) => `            ${ref}`),
				]),
			]),
];
