import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import {
	STATE_ABI_VERSION,
	asWorktreeId,
	canonicalStateHash,
	sha256BytesHex,
	defineInMemoryStateRegistry,
	snapshotFromResolved,
	type IHydrateInput,
	type IResolvedInput,
	type StateScope,
} from '@delendai/state';

import { ROADMAP_PROPOSALS_INDEX_LOCATOR } from '../../src/lib/contracts/constants/roadmap-producer.constant';
import {
	ROADMAP_ENTRY_KINDS,
	ROADMAP_ENTRY_STATES,
} from '../../src/lib/contracts/constants/roadmap.constant';
import { ROADMAP_INPUTS_CHANGED } from '../../src/lib/contracts/constants/roadmap-producer.constant';
import type {
	IRoadmap,
	IRoadmapEntry,
} from '../../src/lib/contracts/interfaces/roadmap.interface';
import { createRoadmapProducer } from '../../src/lib/state/roadmap.producer.service';
import { joinRoadmapFile } from '../../src/lib/store/roadmap-file-codec.helper';

const LOCATOR = 'plan/next.yaml';
const PRODUCER_ID = 'roadmap';
const encoder = new TextEncoder();
const NUM_RUNS = Number(process.env.STATE_PROPERTY_RUNS ?? 200);

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-A'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};
const storageIdentity = { repositoryInstanceId: 'r', worktreeId: 'wt-A' };

interface IModel {
	readonly entries: ReadonlyMap<string, IRoadmapEntry>;
	readonly statuses: ReadonlyMap<string, string>;
}

type IOp =
	| {
			readonly op: 'add';
			readonly id: string;
			readonly kind: IRoadmapEntry['kind'];
	  }
	| {
			readonly op: 'state';
			readonly id: string;
			readonly state: IRoadmapEntry['state'];
	  }
	| { readonly op: 'remove'; readonly id: string }
	| { readonly op: 'proposal'; readonly id: string; readonly status: string };

const idArb = fc.constantFrom('a', 'b', 'c', 'd');
const opArb: fc.Arbitrary<IOp> = fc.oneof(
	fc.record({
		op: fc.constant('add' as const),
		id: idArb,
		kind: fc.constantFrom(...ROADMAP_ENTRY_KINDS),
	}),
	fc.record({
		op: fc.constant('state' as const),
		id: idArb,
		state: fc.constantFrom(...ROADMAP_ENTRY_STATES),
	}),
	fc.record({ op: fc.constant('remove' as const), id: idArb }),
	fc.record({
		op: fc.constant('proposal' as const),
		id: idArb,
		status: fc.constantFrom('ready', 'in_progress', 'done'),
	}),
);

const apply = (model: IModel, op: IOp): IModel => {
	const entries = new Map(model.entries);
	const statuses = new Map(model.statuses);
	if (op.op === 'add' && !entries.has(op.id)) {
		entries.set(op.id, {
			id: op.id,
			title: `Entry ${op.id}`,
			kind: op.kind,
			state: 'proposed',
			gates: [{ kind: 'proposal-done', target: op.id }],
		});
	} else if (op.op === 'state') {
		const found = entries.get(op.id);
		if (found !== undefined)
			entries.set(op.id, { ...found, state: op.state });
	} else if (op.op === 'remove') {
		entries.delete(op.id);
	} else if (op.op === 'proposal') {
		statuses.set(op.id, op.status);
	}
	return { entries, statuses };
};

const resolvedFor = (model: IModel): readonly IResolvedInput[] => {
	const roadmap: IRoadmap = {
		schemaVersion: 1,
		horizons: [{ version: '0.5.0', entries: [...model.entries.values()] }],
	};
	const file = encoder.encode(joinRoadmapFile(LOCATOR, roadmap, ''));
	const index = encoder.encode(
		JSON.stringify(Object.fromEntries([...model.statuses].sort())),
	);
	return [
		{
			producerId: PRODUCER_ID,
			input: { kind: 'file', locator: LOCATOR, digest: digestOf(file) },
			content: file,
		},
		{
			producerId: PRODUCER_ID,
			input: {
				kind: 'opaque',
				locator: ROADMAP_PROPOSALS_INDEX_LOCATOR,
				digest: digestOf(index),
			},
			content: index,
		},
	];
};

const digestOf = (bytes: Uint8Array) => sha256BytesHex(bytes);

const hashOf = (ops: readonly IOp[], replay: boolean): string => {
	const producer = createRoadmapProducer({ roadmapLocator: LOCATOR });
	const registry = defineInMemoryStateRegistry({ clock: () => 0 });
	registry.defineProducer(producer);
	const hydrateInput = (model: IModel): IHydrateInput => ({
		scope,
		storageIdentity,
		snapshot: snapshotFromResolved(resolvedFor(model), registry),
	});
	let model: IModel = { entries: new Map(), statuses: new Map() };
	if (replay) {
		expect(registry.hydrate(hydrateInput(model)).ok).toBe(true);
		for (const op of ops) {
			model = apply(model, op);
			const result = registry.incremental(hydrateInput(model), {
				kind: ROADMAP_INPUTS_CHANGED,
			});
			expect(result.ok).toBe(true);
		}
	} else {
		for (const op of ops) model = apply(model, op);
		expect(registry.hydrate(hydrateInput(model)).ok).toBe(true);
	}
	const read = registry.lookup({ scope, producerId: PRODUCER_ID });
	expect(read.ok).toBe(true);
	if (!read.ok) return '';
	return canonicalStateHash(read.projection);
};

describe('Property: roadmap incremental equals clean rebuild', () => {
	it(`gives the same canonical hash over ${NUM_RUNS} operation sequences`, () => {
		expect(STATE_ABI_VERSION).toBeGreaterThan(0);
		fc.assert(
			fc.property(
				fc.array(opArb, { minLength: 1, maxLength: 25 }),
				(ops) => {
					expect(hashOf(ops, true)).toBe(hashOf(ops, false));
				},
			),
			{ numRuns: NUM_RUNS },
		);
	}, 60_000);
});
