/**
 * queue-order.spec.ts — one candidate moves at a time, and both the job
 * that arms and the machine that brings candidates forward pick the same
 * one.
 */
import { describe, expect, it } from 'vitest';

import {
	culpritRefName,
	queueHead,
	queueOrder,
	runTrain,
	TRAIN_CAPACITY,
	trainMembers,
	culpritsAmong,
	isCulpritMarker,
	trainPrefixesOf,
	trainsToPrune,
	trainRefName,
	trainStep,
	type IQueueCandidateFacts,
	type ITrainCandidate,
	type ITrainPorts,
} from './queue-order';

const PREFIX = 'delendai/pr/';
const candidate = (
	number: number,
	over: Partial<IQueueCandidateFacts> = {},
): IQueueCandidateFacts => ({
	number,
	headRef: `delendai/pr/agent/x${String(number)}-S1-g1/t`,
	draft: false,
	red: false,
	conflicting: false,
	...over,
});

describe('queueHead', () => {
	it('is the oldest candidate, whatever order the forge listed them in', () => {
		expect(
			queueHead([candidate(7), candidate(3), candidate(5)], PREFIX)
				?.number,
		).toBe(3);
	});

	it('passes over a red candidate, which would never merge', () => {
		expect(
			queueHead([candidate(3, { red: true }), candidate(5)], PREFIX)
				?.number,
		).toBe(5);
	});

	it('passes over a conflicting candidate, which the forge cannot merge', () => {
		expect(
			queueHead(
				[candidate(3, { conflicting: true }), candidate(5)],
				PREFIX,
			)?.number,
		).toBe(5);
	});

	it('passes over a draft', () => {
		expect(
			queueHead([candidate(3, { draft: true }), candidate(5)], PREFIX)
				?.number,
		).toBe(5);
	});

	it('never picks a pull request from outside the publication namespace', () => {
		expect(
			queueHead([candidate(1, { headRef: 'feature/theirs' })], PREFIX),
		).toBeUndefined();
	});

	it('has no head when nothing is ready', () => {
		expect(queueHead([], PREFIX)).toBeUndefined();
	});
});

describe('queueOrder', () => {
	it('keeps a conflicting candidate in its place, so it can still be brought forward', () => {
		expect(
			queueOrder(
				[
					candidate(5),
					candidate(3, { conflicting: true }),
					candidate(4, { red: true }),
					candidate(6, { draft: true }),
				],
				PREFIX,
			).map((facts) => facts.number),
		).toEqual([3, 5]);
	});

	it('leads with an urgent candidate, then keeps the oldest first (x01051)', () => {
		expect(
			queueOrder(
				[
					candidate(3),
					candidate(8, { urgent: 'integration is red' }),
					candidate(5),
					candidate(9, { urgent: 'a fix' }),
				],
				PREFIX,
			).map((facts) => facts.number),
		).toEqual([8, 9, 3, 5]);
	});

	it('has the head as its first candidate that does not conflict', () => {
		const candidates = [
			candidate(3, { conflicting: true }),
			candidate(4, { conflicting: true }),
			candidate(5),
		];
		expect(queueHead(candidates, PREFIX)).toBe(
			queueOrder(candidates, PREFIX).find((facts) => !facts.conflicting),
		);
	});
});

const rider = (number: number): ITrainCandidate => ({
	number,
	headRef: `delendai/pr/agent/x${String(number)}-S1-g1/t`,
	headSha: `head${String(number)}`,
});

const TIP = 'a'.repeat(40);
const TRAINS = 'delendai/train/';

/**
 * A forge on fixtures: a train turns red when it carries a culprit, a
 * candidate in `conflicts` cannot be merged, and every dispatched train
 * finishes at once when `finish` is called.
 */
const fakeForge = (
	options: {
		readonly culprits?: readonly number[];
		readonly conflicts?: readonly number[];
		readonly fastForward?: boolean;
		readonly pushFailure?: string;
	} = {},
) => {
	const built = new Map<string, readonly number[]>();
	const finished = new Set<string>();
	const runs: string[] = [];
	const blamed: number[] = [];
	const said: string[] = [];
	const landings: { sha: string; members: readonly number[] }[] = [];
	const ports: ITrainPorts = {
		trainAt: (ref) => (built.has(ref) ? `sha:${ref}` : undefined),
		runAt: (sha) => {
			const ref = sha.slice('sha:'.length);
			if (!runs.includes(ref)) return 'uncertified';
			if (!finished.has(ref)) return 'pending';
			const members = built.get(ref) ?? [];
			return members.some((n) => options.culprits?.includes(n) === true)
				? 'red'
				: 'certified';
		},
		assemble: (ref, members) => {
			const conflicting = members
				.map((m) => m.number)
				.filter((n) => options.conflicts?.includes(n) === true);
			if (options.pushFailure !== undefined) {
				return { conflicting: [], pushFailure: options.pushFailure };
			}
			if (conflicting.length === 0) {
				built.set(
					ref,
					members.map((m) => m.number),
				);
			}
			return { conflicting };
		},
		dispatch: (ref) => {
			runs.push(ref);
			return true;
		},
		land: (sha, members) => {
			landings.push({ sha, members: members.map((m) => m.number) });
			return options.fastForward === false
				? members.slice(0, 1).map((m) => m.number)
				: members.map((m) => m.number);
		},
		blame: (member) => {
			blamed.push(member.number);
		},
		say: (line) => {
			said.push(line);
		},
	};
	const finish = (): void => {
		for (const ref of runs) finished.add(ref);
	};
	return { ports, runs, blamed, said, landings, finish };
};

/** Run the queue until it lands something or stops moving. */
const drive = (
	forge: ReturnType<typeof fakeForge>,
	members: readonly ITrainCandidate[],
): readonly number[] => {
	for (let pass = 0; pass < 20; pass += 1) {
		const landed = runTrain({
			trainPrefix: TRAINS,
			tipSha: TIP,
			// The culprit branch keeps a blamed head out of later trains.
			members: members.filter((m) => !forge.blamed.includes(m.number)),
			ports: forge.ports,
		});
		if (landed.length > 0) return landed;
		forge.finish();
	}
	return [];
};

describe('the merge train', () => {
	it('lands a disjoint batch with one run of the union of their scopes', () => {
		const forge = fakeForge();
		const landed = drive(forge, [rider(3), rider(5), rider(8)]);
		expect(landed).toEqual([3, 5, 8]);
		expect(forge.runs).toEqual([trainRefName(TRAINS, TIP, [3, 5, 8])]);
		expect(forge.landings).toEqual([
			{
				sha: `sha:${trainRefName(TRAINS, TIP, [3, 5, 8])}`,
				members: [3, 5, 8],
			},
		]);
	});

	it('bisects a red train to its culprit and lands the rest', () => {
		const forge = fakeForge({ culprits: [7] });
		let pool = [1, 2, 3, 4, 5, 6, 7, 8].map(rider);
		const batches: (readonly number[])[] = [];
		for (let round = 0; round < 8 && pool.length > 0; round += 1) {
			const landed = drive(forge, pool);
			if (landed.length === 0) break;
			batches.push(landed);
			pool = pool.filter((m) => !landed.includes(m.number));
		}
		expect(forge.blamed).toEqual([7]);
		expect(batches).toEqual([[1, 2, 3, 4], [5, 6], [8]]);
		// Halving: the eight, then four, two and one at a time around the
		// culprit; never one certification per pull request in series.
		expect(forge.runs).toHaveLength(7);
	});

	it('names the culprit when a green first half leaves one member', () => {
		const forge = fakeForge({ culprits: [2] });
		const landed = drive(forge, [rider(1), rider(2)]);
		expect(landed).toEqual([1]);
		expect(forge.blamed).toEqual([2]);
	});

	it('does not blame a member whose own checks are green for a train red by itself', () => {
		const forge = fakeForge({ culprits: [4] });
		const reported: string[] = [];
		const ports: ITrainPorts = {
			...forge.ports,
			trainFault: () => ['lint-governance'],
			reportTrainRed: (ref, member, jobs) => {
				reported.push(
					`${ref}|${String(member.number)}|${jobs.join(',')}`,
				);
			},
		};
		const landed = [0, 1, 2].flatMap(() => {
			const out = runTrain({
				trainPrefix: TRAINS,
				tipSha: TIP,
				members: [rider(4)],
				ports,
			});
			forge.finish();
			return out;
		});
		expect(landed).toEqual([]);
		expect(forge.blamed).toEqual([]);
		// Every pass refreshes the same issue; it never opens a second.
		expect([...new Set(reported)]).toEqual([
			`${trainRefName(TRAINS, TIP, [4])}|4|lint-governance`,
		]);
		expect(forge.said.join('\n')).toContain(
			"the train's own checks are red: lint-governance",
		);
	});

	it('still blames a member whose own checks are not green', () => {
		const forge = fakeForge({ culprits: [4] });
		const ports: ITrainPorts = {
			...forge.ports,
			trainFault: () => undefined,
			reportTrainRed: () => {
				throw new Error('no issue for a member at fault');
			},
		};
		for (let pass = 0; pass < 3; pass += 1) {
			runTrain({
				trainPrefix: TRAINS,
				tipSha: TIP,
				members: [rider(4)],
				ports,
			});
			forge.finish();
		}
		expect([...new Set(forge.blamed)]).toEqual([4]);
	});

	it('splits only a textual conflict outside the derived files off the train', () => {
		const forge = fakeForge({ conflicts: [5] });
		const landed = drive(forge, [rider(3), rider(5), rider(8)]);
		expect(landed).toEqual([3, 8]);
		expect(forge.runs).toEqual([trainRefName(TRAINS, TIP, [3, 8])]);
	});

	it('reports a declined push with its reason and dispatches nothing', () => {
		const reason = 'remote: Cannot create ref: creations restricted';
		const forge = fakeForge({ pushFailure: reason });
		expect(drive(forge, [rider(3), rider(5)])).toEqual([]);
		expect(forge.runs).toEqual([]);
		expect(forge.said.some((line) => line.includes(reason))).toBe(true);
	});

	it('says how many landed when the forge stops a merge part way', () => {
		const forge = fakeForge({ fastForward: false });
		expect(drive(forge, [rider(3), rider(5)])).toEqual([3]);
	});

	it('does nothing without members, and waits on a running train', () => {
		const forge = fakeForge();
		expect(
			runTrain({
				trainPrefix: TRAINS,
				tipSha: TIP,
				members: [],
				ports: forge.ports,
			}),
		).toEqual([]);
		runTrain({
			trainPrefix: TRAINS,
			tipSha: TIP,
			members: [rider(1)],
			ports: forge.ports,
		});
		expect(
			runTrain({
				trainPrefix: TRAINS,
				tipSha: TIP,
				members: [rider(1)],
				ports: forge.ports,
			}),
		).toEqual([]);
		expect(forge.runs).toHaveLength(1);
	});

	it('tries again next time when the train run cannot be dispatched', () => {
		const forge = fakeForge();
		const ports: ITrainPorts = { ...forge.ports, dispatch: () => false };
		expect(
			runTrain({
				trainPrefix: TRAINS,
				tipSha: TIP,
				members: [rider(1), rider(2)],
				ports,
			}),
		).toEqual([]);
	});
});

describe('trainStep', () => {
	it('is none for an empty train', () => {
		expect(trainStep([], () => 'certified')).toEqual({ kind: 'none' });
	});

	it('names a red train of one as the culprit', () => {
		expect(trainStep([4], () => 'red')).toEqual({
			kind: 'culprit',
			number: 4,
		});
	});

	it('waits on the first half while it runs', () => {
		expect(
			trainStep([1, 2, 3], (members) =>
				members.length === 3 ? 'red' : 'pending',
			),
		).toEqual({ kind: 'wait', members: [1, 2] });
	});
});

describe('train members', () => {
	it('takes candidates in order, up to the capacity', () => {
		const many = Array.from({ length: 12 }, (_, i) => rider(i + 1));
		expect(trainMembers(many, new Map()).map((m) => m.number)).toEqual(
			Array.from({ length: TRAIN_CAPACITY }, (_, i) => i + 1),
		);
	});

	it('leaves out a culprit until its head moves', () => {
		const culprits = new Map([
			[3, 'head3'],
			[5, 'an older head'],
		]);
		expect(
			trainMembers([rider(3), rider(5)], culprits).map((m) => m.number),
		).toEqual([5]);
	});

	it('leaves out an overlapping candidate, which the overlap verdicts never accept', () => {
		// The members are the accepted verdicts: an overlapping candidate is
		// not among them, so it never reaches the train.
		const accepted = [
			{ number: 3, accepted: true },
			{ number: 4, accepted: false },
			{ number: 5, accepted: true },
		]
			.filter((verdict) => verdict.accepted)
			.map((verdict) => rider(verdict.number));
		expect(trainMembers(accepted, new Map()).map((m) => m.number)).toEqual([
			3, 5,
		]);
	});
});

describe('train names', () => {
	const branchesOf = (
		namespacePrefix: string,
		formerNamespacePrefixes: readonly string[] = [],
	) =>
		({
			namespacePrefix,
			formerNamespacePrefixes,
			workRefPrefix: '',
			workRefVisibility: 'visible',
			publicationRefPrefix: '',
		}) as Parameters<typeof trainPrefixesOf>[0];

	it('lives under the policy namespace, and at the root with none', () => {
		expect(trainPrefixesOf(branchesOf('acme'))).toEqual(['acme/train/']);
		expect(trainPrefixesOf(branchesOf(''))).toEqual(['train/']);
	});

	it('reads trains under a former namespace too, the current one first', () => {
		expect(trainPrefixesOf(branchesOf('', ['delendai']))).toEqual([
			'train/',
			'delendai/train/',
		]);
	});

	it('names an empty-namespace train and culprit at the root', () => {
		const [prefix = ''] = trainPrefixesOf(branchesOf(''));
		expect(trainRefName(prefix, TIP, [3, 5])).toBe(
			`train/${'a'.repeat(12)}/3-5`,
		);
		expect(culpritRefName(prefix, 7)).toBe('train/culprit/7');
	});

	it('finds culprits under every owned namespace', () => {
		const prefixes = trainPrefixesOf(branchesOf('', ['delendai']));
		const branches = new Map([
			['train/culprit/7', 'h7'],
			['delendai/train/culprit/9', 'h9'],
			['train/culprit/not-a-number', 'hx'],
			[`train/${'a'.repeat(12)}/3-5`, 't35'],
		]);
		expect([...culpritsAmong(prefixes, branches)]).toEqual([
			[7, 'h7'],
			[9, 'h9'],
		]);
		expect(isCulpritMarker(prefixes, 'train/culprit/7')).toBe(true);
		expect(isCulpritMarker(prefixes, 'train/abc/1')).toBe(false);
	});

	it('prunes trains of another tip and former namespaces, keeping markers', () => {
		const prefixes = trainPrefixesOf(branchesOf('acme', ['delendai']));
		const current = trainRefName('acme/train/', TIP, [1, 2]);
		const branches = new Map([
			[current, 'c'],
			['acme/train/bbbbbbbbbbbb/1-2', 'old'],
			['delendai/train/bbbbbbbbbbbb/5-6', 'former'],
			['acme/train/culprit/7', 'h7'],
			['delendai/train/culprit/8', 'h8'],
		]);
		expect(
			trainsToPrune({
				prefixes,
				tipSha: TIP,
				branches,
			}),
		).toEqual([
			'acme/train/bbbbbbbbbbbb/1-2',
			'delendai/train/bbbbbbbbbbbb/5-6',
		]);
		expect(
			trainsToPrune({
				prefixes: [],
				tipSha: TIP,
				branches: new Map(),
			}),
		).toEqual([]);
	});

	it('names the tip and the members, and the culprit by number', () => {
		expect(trainRefName(TRAINS, TIP, [3, 5])).toBe(
			`delendai/train/${'a'.repeat(12)}/3-5`,
		);
		expect(culpritRefName(TRAINS, 7)).toBe('delendai/train/culprit/7');
	});
});
