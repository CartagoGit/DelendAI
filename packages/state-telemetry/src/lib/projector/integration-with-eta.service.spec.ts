import { describe, expect, it } from 'vitest';

import { MemoryDurationHistoryStore } from '../eta/duration-history';
import { computeFeatureVector } from '../eta/feature-vector';
import type { IWorkProgressSnapshot } from './contracts/interfaces/work-progress.interface';
import {
	classifyStalledByEta,
	createEtaIntegration,
} from './integration-with-eta.service';

const VECTOR = computeFeatureVector({ slice_count: 2, test_count: 3 });
const ACTOR = 'agent-one';
const KIND = 'feat:review';

const snapshot = (
	overrides: Partial<IWorkProgressSnapshot> = {},
): IWorkProgressSnapshot => ({
	workItemId: 'f1/S1',
	proposalId: 'f1',
	sliceId: 'S1',
	phase: 'implementing',
	progress: 40,
	weight: 1,
	confidence: 0.8,
	uncertainty: 0.2,
	stalled: false,
	eventCount: 10,
	lastEventAt: 1000,
	...overrides,
});

const seeded = (durations: readonly number[]): MemoryDurationHistoryStore => {
	const store = new MemoryDurationHistoryStore({ medianGuard: false });
	for (const durationMs of durations) {
		store.recordDuration({
			vector: VECTOR,
			actorProfile: ACTOR,
			taskKind: KIND,
			durationMs,
			outcome: 'review',
		});
	}
	return store;
};

const integrationOver = (store: MemoryDurationHistoryStore, observedMs = 0) =>
	createEtaIntegration({
		source: store,
		describe: () => ({
			featureVector: VECTOR,
			actorProfile: ACTOR,
			taskKind: KIND,
			observedMs,
		}),
	});

describe('createEtaIntegration', () => {
	it('adds the estimate and keeps every field the projector produced', () => {
		const result = integrationOver(
			seeded([10_000, 20_000, 30_000, 40_000, 50_000]),
		).annotate(snapshot());
		expect(result).toMatchObject({
			...snapshot(),
			eta_p50_ms: 30_000,
			eta_p80_ms: 40_000,
			eta_reason: 'computed',
		});
	});

	it('reports no history, with null fields, under five samples', () => {
		const result = integrationOver(seeded([10_000, 20_000])).annotate(
			snapshot(),
		);
		expect(result).toMatchObject({
			eta_p50_ms: null,
			eta_p80_ms: null,
			eta_reason: 'insufficient_history',
		});
	});

	it('reports no history when nothing is known about the item', () => {
		const result = createEtaIntegration({
			source: seeded([1, 2, 3, 4, 5]),
			describe: () => undefined,
		}).annotate(snapshot());
		expect(result.eta_reason).toBe('insufficient_history');
	});
});

describe('classifyStalledByEta', () => {
	const annotated = (stalled: boolean, p80: number | null) => ({
		...snapshot({ stalled }),
		eta_p50_ms: p80,
		eta_p80_ms: p80,
		eta_reason:
			p80 === null
				? ('insufficient_history' as const)
				: ('computed' as const),
	});

	it('ignores items that are not stalled', () => {
		expect(classifyStalledByEta(annotated(false, 100), 90)).toBe(
			'not-stalled',
		);
	});

	it('tells a stall near the end of the budget from one near the start', () => {
		expect(classifyStalledByEta(annotated(true, 100_000), 90_000)).toBe(
			'near-completion',
		);
		expect(classifyStalledByEta(annotated(true, 100_000), 5_000)).toBe(
			'far-from-done',
		);
	});

	it('does not guess without an estimate', () => {
		expect(classifyStalledByEta(annotated(true, null), 5_000)).toBe(
			'unknown',
		);
	});
});
