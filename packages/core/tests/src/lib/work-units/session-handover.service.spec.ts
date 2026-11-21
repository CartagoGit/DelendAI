import { asRepositoryInstanceId } from '@delendai/state';
import type {
	IArtifactKey,
	IArtifactRecord,
	IArtifactStore,
	StateScope,
} from '@delendai/state';
import { describe, expect, it } from 'vitest';

import type {
	IHandoverEntry,
	ISessionHandoverLocation,
} from '../../../../src/lib/work-units/session-handover.interface';
import {
	buildSessionHandover,
	handoverDetail,
	handoverIndex,
	loadSessionHandover,
	persistSessionHandover,
	resumeSessionHandover,
} from '../../../../src/lib/work-units/session-handover.service';

const scope: StateScope = {
	kind: 'swarm',
	locator: {
		repositoryInstanceId: asRepositoryInstanceId('r'),
		swarmRoot: '/swarm',
	},
};
const location: ISessionHandoverLocation = { scope, sessionId: 's1' };

const memoryStore = (): IArtifactStore => {
	const records = new Map<string, IArtifactRecord<unknown>>();
	const id = (key: IArtifactKey): string => `${key.kind}:${key.id}`;
	return {
		async put<T>(key: IArtifactKey, value: T) {
			const record: IArtifactRecord<T> = {
				key,
				value,
				contentHash: 'h',
				createdAt: 0,
				updatedAt: 0,
				reconciledCommitSha: '',
			};
			records.set(id(key), record);
			return record;
		},
		async get<T>(key: IArtifactKey) {
			return (
				(records.get(id(key)) as IArtifactRecord<T> | undefined) ?? null
			);
		},
		async delete(key) {
			records.delete(id(key));
		},
		async list() {
			return [];
		},
	};
};

const entry = (id: string, summary = `summary ${id}`): IHandoverEntry => ({
	id,
	summary,
	source: `store/${id}`,
});

describe('buildSessionHandover', () => {
	it('[<20ms] reads each section from its store and reports the ones no store answers as missing', async () => {
		const handover = await buildSessionHandover({
			sessionId: 's1',
			now: 5,
			sources: {
				invariants: async () => [entry('i1')],
				units: async () => {
					throw new Error('store unreadable');
				},
			},
		});
		expect(handover.sections.invariants).toEqual([entry('i1')]);
		expect(handover.sections.units).toEqual([]);
		expect(handover.missing).toContain('units');
		expect(handover.missing).toContain('decisions');
		expect(handover.missing).not.toContain('invariants');
		expect(handover.builtAt).toBe(5);
	});
});

describe('persist, index and detail', () => {
	it('[<20ms] persists the handover and loads it back', async () => {
		const store = memoryStore();
		const handover = await buildSessionHandover({
			sessionId: 's1',
			now: 1,
			sources: { decisions: async () => [entry('d1')] },
		});
		expect(await loadSessionHandover(store, location)).toBeNull();
		await persistSessionHandover(store, location, handover);
		expect(await loadSessionHandover(store, location)).toEqual(handover);
	});

	it('[<20ms] bounds the index and fetches one entry in full on demand', async () => {
		const many = Array.from({ length: 9 }, (_, n) =>
			entry(`e${n}`, 'x'.repeat(200)),
		);
		const handover = await buildSessionHandover({
			sessionId: 's1',
			now: 1,
			sources: { evidence: async () => many },
		});
		const index = handoverIndex(handover);
		expect(index.counts.evidence).toBe(9);
		expect(index.entries.evidence).toHaveLength(5);
		expect(index.entries.evidence[0]?.summary.length).toBe(80);
		expect(
			handoverDetail(handover, 'evidence', 'e8')?.summary,
		).toHaveLength(200);
		expect(handoverDetail(handover, 'evidence', 'nope')).toBeUndefined();
	});
});

describe('resumeSessionHandover', () => {
	it('[<20ms] rebuilds from the stores and fills only what they cannot answer from the persisted handover', async () => {
		const store = memoryStore();
		await persistSessionHandover(
			store,
			location,
			await buildSessionHandover({
				sessionId: 's1',
				now: 1,
				sources: {
					decisions: async () => [entry('old-decision')],
					units: async () => [entry('old-unit')],
				},
			}),
		);
		const resumed = await resumeSessionHandover({
			sessionId: 's1',
			now: 2,
			store,
			location,
			sources: { units: async () => [entry('new-unit')] },
		});
		expect(resumed.sections.units).toEqual([entry('new-unit')]);
		expect(resumed.sections.decisions).toEqual([entry('old-decision')]);
		expect(resumed.missing).not.toContain('decisions');
		expect(resumed.missing).toContain('blockers');
	});

	it('[<20ms] invents nothing when no store and no persisted handover answer', async () => {
		const resumed = await resumeSessionHandover({
			sessionId: 's1',
			now: 2,
			store: memoryStore(),
			location,
			sources: {},
		});
		expect(resumed.missing).toHaveLength(12);
		expect(resumed.sections.units).toEqual([]);
	});

	it('[<20ms] returns the rebuilt handover untouched when every section is answered', async () => {
		const answered = Object.fromEntries(
			[
				'invariants',
				'decisions',
				'units',
				'pending',
				'done',
				'branches',
				'commits',
				'pullRequests',
				'evidence',
				'tests',
				'errors',
				'blockers',
			].map((name) => [name, async () => [entry(name)]]),
		);
		const resumed = await resumeSessionHandover({
			sessionId: 's1',
			now: 2,
			store: memoryStore(),
			location,
			sources: answered,
		});
		expect(resumed.missing).toEqual([]);
	});
});
