/**
 * queue-order.spec.ts — one candidate moves at a time, and both the job
 * that arms and the machine that brings candidates forward pick the same
 * one.
 */
import { describe, expect, it } from 'vitest';

import type { IIntegrationCertification } from './certify-integration.interface';
import {
	certifiedByTrain,
	culpritRefName,
	queueHead,
	queueOrder,
	repairStep,
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

describe('repairStep: the candidate that repairs a red integration branch', () => {
	const runs =
		(states: Record<number, IIntegrationCertification>) =>
		(candidate: IQueueCandidateFacts): IIntegrationCertification =>
			states[candidate.number] ?? 'uncertified';
	const level = () => true;

	it('arms the oldest level candidate whose full run is green', () => {
		expect(
			repairStep(
				[candidate(9), candidate(4)],
				PREFIX,
				level,
				runs({ 4: 'certified', 9: 'certified' }),
			),
		).toEqual({ kind: 'arm', number: 4 });
	});

	it('passes over a candidate whose full run is red, and dispatches one for the next', () => {
		expect(
			repairStep(
				[candidate(4), candidate(6)],
				PREFIX,
				level,
				runs({ 4: 'red' }),
			),
		).toEqual({
			kind: 'dispatch',
			number: 6,
			headRef: candidate(6).headRef,
		});
	});

	it('waits for a full run in progress instead of dispatching another', () => {
		expect(
			repairStep(
				[candidate(4), candidate(6)],
				PREFIX,
				level,
				runs({ 4: 'pending' }),
			),
		).toEqual({ kind: 'wait', number: 4 });
	});

	it('never proposes a candidate that is behind, conflicting, red or a draft', () => {
		expect(
			repairStep(
				[
					candidate(1),
					candidate(2, { conflicting: true }),
					candidate(3, { red: true }),
					candidate(5, { draft: true }),
				],
				PREFIX,
				(each) => each.number !== 1,
				runs({
					1: 'certified',
					2: 'certified',
					3: 'certified',
					5: 'certified',
				}),
			),
		).toEqual({ kind: 'none' });
	});

	it('asks nothing of a candidate after the one it chose', () => {
		const asked: number[] = [];
		repairStep([candidate(4), candidate(6)], PREFIX, level, (each) => {
			asked.push(each.number);
			return 'certified';
		});
		expect(asked).toEqual([4]);
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
		fullRunAt: (sha) => {
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
	anchor?: ITrainCandidate,
): readonly number[] => {
	for (let pass = 0; pass < 20; pass += 1) {
		const landed = runTrain({
			trainPrefix: TRAINS,
			tipSha: TIP,
			// The culprit branch keeps a blamed head out of later trains.
			members: members.filter((m) => !forge.blamed.includes(m.number)),
			...(anchor === undefined ? {} : { anchor }),
			ports: forge.ports,
		});
		if (landed.length > 0) return landed;
		forge.finish();
	}
	return [];
};

describe('the merge train', () => {
	it('lands a disjoint batch with one full run', () => {
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

	it('excludes a candidate that conflicts with the train', () => {
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

	it('lets a repair lead the train, in every half', () => {
		const forge = fakeForge({ culprits: [6] });
		const landed = drive(forge, [rider(5), rider(6)], rider(2));
		expect(landed).toEqual([2, 5]);
		expect(forge.runs.every((ref) => ref.includes(`/${'2'}-`))).toBe(true);
		expect(forge.blamed).toEqual([6]);
	});

	it('lands nothing when the repair itself conflicts', () => {
		const forge = fakeForge({ conflicts: [2] });
		expect(drive(forge, [rider(5)], rider(2))).toEqual([]);
		expect(forge.runs).toEqual([]);
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

	it('tries again next time when the full run cannot be dispatched', () => {
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

	it('prunes trains of another tip and former namespaces, keeping markers and the proving tree', () => {
		const prefixes = trainPrefixesOf(branchesOf('acme', ['delendai']));
		const current = trainRefName('acme/train/', TIP, [1, 2]);
		const branches = new Map([
			[current, 'c'],
			['acme/train/bbbbbbbbbbbb/1-2', 'old'],
			['acme/train/cccccccccccc/3-4', 'proving'],
			['delendai/train/bbbbbbbbbbbb/5-6', 'former'],
			['acme/train/culprit/7', 'h7'],
			['delendai/train/culprit/8', 'h8'],
		]);
		expect(
			trainsToPrune({
				prefixes,
				tipSha: TIP,
				branches,
				keep: (sha) => sha === 'proving',
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
				keep: () => false,
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

describe('certifiedByTrain', () => {
	it('proves a tip with the tree of a green train', () => {
		const trains = [
			{ sha: 's1', tree: 't1' },
			{ sha: 's2', tree: 't2' },
		];
		const runs = (sha: string): IIntegrationCertification =>
			sha === 's2' ? 'certified' : 'red';
		expect(certifiedByTrain('t2', trains, runs)).toBe(true);
		expect(certifiedByTrain('t1', trains, runs)).toBe(false);
		expect(certifiedByTrain('t3', trains, runs)).toBe(false);
	});
});
