/**
 * queue-order.ts — which candidate moves next.
 *
 * Bringing every open candidate forward each time the integration branch
 * moved put a `Merge develop into …` commit on every candidate for every
 * merge: in one day, 68 such merges against 43 pull requests and 67
 * authored commits. The graph became a maze, and most of those merges
 * were thrown away by the next one.
 *
 * A merge queue does the opposite: one candidate at a time is brought up
 * to the integration branch, validated against it and merged; the rest
 * wait untouched. The forge's own merge queue is not available to every
 * repository (a personal account has none), so this is that queue: one
 * definition of the head, used by the job that arms and by the machine
 * that brings candidates forward, so the two can never pick different
 * candidates.
 */
import type { IIntegrationCertification } from './certify-integration.interface';
import type {
	IQueueCandidateFacts,
	ITrainCandidate,
	ITrainPorts,
	ITrainStep,
} from './queue-order.interface';
import { trainPrefixesOf, underPublication } from './publication-prefixes';

export type {
	IQueueCandidateFacts,
	ITrainCandidate,
	ITrainPorts,
	ITrainStep,
} from './queue-order.interface';

/**
 * The queue itself: the pull requests this model produced that are ready
 * (not drafts) and not red (they would never merge), urgent ones first
 * (`work deliver --urgent`), then oldest first.
 * Conflicting ones keep their place: a conflict confined to derived
 * files is resolved by the machine that brings candidates forward.
 */
export const queueOrder = (
	candidates: readonly IQueueCandidateFacts[],
	publicationPrefix: string | readonly string[],
): readonly IQueueCandidateFacts[] =>
	[...candidates]
		.filter(
			(candidate) =>
				underPublication(candidate.headRef, publicationPrefix) &&
				!candidate.draft &&
				!candidate.red,
		)
		.sort(
			(a, b) =>
				Number(b.urgent !== undefined) -
					Number(a.urgent !== undefined) || a.number - b.number,
		);

/**
 * The candidate that moves next: the oldest one in the queue that is not
 * conflicting — the forge cannot merge a conflicting one. `undefined`
 * when none is.
 */
export const queueHead = (
	candidates: readonly IQueueCandidateFacts[],
	publicationPrefix: string | readonly string[],
): IQueueCandidateFacts | undefined =>
	queueOrder(candidates, publicationPrefix).find(
		(candidate) => !candidate.conflicting,
	);

/**
 * The most pull requests one train carries. Bisecting a red train of
 * eight costs at most three more runs; a longer train saves less
 * than a red one costs.
 */
export const TRAIN_CAPACITY = 8;

export { trainPrefixesOf };

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
 * Move one train forward and return the members that landed.
 *
 * The train is the integration tip with each member merged in order, so
 * one run of the union of their scopes, judged since the tip, proves them
 * all together. A member that conflicts leaves the train; a culprit is
 * blamed and leaves it; the rest go on.
 */
export const runTrain = (input: {
	readonly trainPrefix: string;
	readonly tipSha: string;
	readonly members: readonly ITrainCandidate[];
	readonly ports: ITrainPorts;
}): readonly number[] => {
	const { ports } = input;
	let pool = [...input.members];
	const byNumber = (numbers: readonly number[]): readonly ITrainCandidate[] =>
		numbers.flatMap((n) => pool.filter((c) => c.number === n));
	const refOf = (numbers: readonly number[]): string =>
		trainRefName(input.trainPrefix, input.tipSha, numbers);
	const stateOf = (numbers: readonly number[]): IIntegrationCertification => {
		const sha = ports.trainAt(refOf(numbers));
		return sha === undefined ? 'uncertified' : ports.runAt(sha);
	};
	const label = (numbers: readonly number[]): string =>
		numbers.map((n) => `#${String(n)}`).join(', ');
	// Each pass either acts and returns, or takes one member out.
	while (pool.length > 0) {
		const step = trainStep(
			pool.map((c) => c.number),
			stateOf,
		);
		if (step.kind === 'none') return [];
		if (step.kind === 'culprit') {
			const culprit = byNumber([step.number])[0];
			if (culprit !== undefined) ports.blame(culprit);
			ports.say(
				`keep-the-queue-moving: #${String(step.number)} alone turns the train red; it leaves the train until its head moves.`,
			);
			pool = pool.filter((c) => c.number !== step.number);
			continue;
		}
		const ref = refOf(step.members);
		if (step.kind === 'wait') {
			ports.say(
				`keep-the-queue-moving: the train ${ref} (${label(step.members)}) is running its run.`,
			);
			return [];
		}
		if (step.kind === 'dispatch') {
			const { conflicting, pushFailure } = ports.assemble(
				ref,
				byNumber(step.members),
			);
			if (pushFailure !== undefined) {
				ports.say(
					`keep-the-queue-moving: the train ${ref} was not pushed, so nothing is dispatched: ${pushFailure}`,
				);
				return [];
			}
			if (conflicting.length > 0) {
				ports.say(
					`keep-the-queue-moving: ${conflicting.map((n) => `#${String(n)}`).join(', ')} conflict(s) with the train; left out of it.`,
				);
				const out = new Set(conflicting);
				pool = pool.filter((c) => !out.has(c.number));
				continue;
			}
			const started = ports.dispatch(ref);
			ports.say(
				started
					? `keep-the-queue-moving: dispatched one run of the union of its members' scopes on the train ${ref} (${label(step.members)}).`
					: `keep-the-queue-moving: could not dispatch the train ${ref}; the next run tries again.`,
			);
			return [];
		}
		const sha = ports.trainAt(ref) ?? '';
		if (step.culprit !== undefined) {
			const culprit = byNumber([step.culprit])[0];
			if (culprit !== undefined) ports.blame(culprit);
		}
		const landed = ports.land(sha, byNumber(step.members));
		ports.say(
			`keep-the-queue-moving: the train ${ref} is green; landed ${landed.map((n) => `#${String(n)}`).join(', ') || 'nothing'} of ${label(step.members)}.`,
		);
		return landed;
	}
	return [];
};
