/**
 * culprit.ts — which pull request turns a train red, and the names of a
 * train's refs.
 *
 * A green train lands; a red one is split in half until one member alone
 * is red (`trainStep`). With the failing zones and specs known, the
 * footprints of the members say who owns the failure (`attributeCulprit`).
 */
import { TRAIN_CAPACITY } from './culprit.constant';
import type {
	IIntegrationCertification,
	ITrainCandidate,
	ITrainStep,
} from './culprit.interface';
import type { IChangeFootprint } from './overlap.interface';

/** Whether `branch` is a culprit marker under one of the train prefixes. */
const culpritMarkerOf = (
	prefixes: readonly string[],
	branch: string,
): number | undefined => {
	for (const prefix of prefixes) {
		const marker = `${prefix}culprit/`;
		if (!branch.startsWith(marker)) continue;
		const number = Number(branch.slice(marker.length));
		return Number.isInteger(number) && number > 0 ? number : undefined;
	}
	return undefined;
};

/** The candidates whose current head was isolated, read off the markers. */
export const culpritsAmong = (
	prefixes: readonly string[],
	branches: ReadonlyMap<string, string>,
): ReadonlyMap<number, string> =>
	new Map(
		[...branches].flatMap(([branch, sha]) => {
			const number = culpritMarkerOf(prefixes, branch);
			return number === undefined ? [] : [[number, sha] as const];
		}),
	);

/** Whether `branch` is a culprit marker rather than a train. */
export const isCulpritMarker = (
	prefixes: readonly string[],
	branch: string,
): boolean => prefixes.some((prefix) => branch.startsWith(`${prefix}culprit/`));

/**
 * The train branches to delete: every one that starts from another tip or
 * lives under a former namespace. Culprit markers stay until their pull
 * request moves.
 */
export const trainsToPrune = (input: {
	readonly prefixes: readonly string[];
	readonly tipSha: string;
	readonly branches: ReadonlyMap<string, string>;
}): readonly string[] => {
	const current = `${input.prefixes[0] ?? 'train/'}${input.tipSha.slice(0, 12)}/`;
	return [...input.branches.keys()].filter(
		(branch) =>
			!isCulpritMarker(input.prefixes, branch) &&
			!branch.startsWith(current),
	);
};

/**
 * The branch of one train: the integration tip it starts from and its
 * members in order. The name is the train's identity, so a later run of
 * the queue finds the train an earlier run built and reads its run.
 */
export const trainRefName = (
	trainPrefix: string,
	tipSha: string,
	members: readonly number[],
): string => `${trainPrefix}${tipSha.slice(0, 12)}/${members.join('-')}`;

/** The branch that remembers a culprit's head, so it waits for a new one. */
export const culpritRefName = (trainPrefix: string, number: number): string =>
	`${trainPrefix}culprit/${String(number)}`;

/**
 * The candidates that ride the next train: in queue order, none whose
 * current head was already isolated as a culprit, at most `capacity`.
 * The candidates come from the riders' verdicts (`acceptRiders`), in
 * train order; overlapping and behind ones ride too, because the train's
 * one run proves the combination against the integration tip.
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
 * What to do with a train of `members`, given what each train already
 * built has shown. A green train lands; a red one is split in half and
 * its first half tried, until one member alone is red: the culprit. A
 * green first half lands on its own, and when the second half is a single
 * member that member is the culprit.
 */
export const trainStep = (
	members: readonly number[],
	stateOf: (members: readonly number[]) => IIntegrationCertification,
): ITrainStep => {
	if (members.length === 0) return { kind: 'none' };
	const state = stateOf(members);
	if (state === 'certified') return { kind: 'land', members };
	if (state === 'pending') return { kind: 'wait', members };
	if (state === 'uncertified') return { kind: 'dispatch', members };
	const [only] = members;
	if (members.length === 1 && only !== undefined) {
		return { kind: 'culprit', number: only };
	}
	const half = Math.ceil(members.length / 2);
	const right = members.slice(half);
	const inner = trainStep(members.slice(0, half), stateOf);
	const [suspect] = right;
	return inner.kind === 'land' && right.length === 1 && suspect !== undefined
		? { ...inner, culprit: suspect }
		: inner;
};

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
