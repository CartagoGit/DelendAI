import { describe, expect, it } from 'vitest';

import { MemoryDurationHistoryStore } from '../../src/lib/eta/duration-history';
import { computeFeatureVector } from '../../src/lib/eta/feature-vector';
import { createWorkProgressService } from '../../src/lib/projector/work-progress-api.service';
import {
	classifyStalledByEta,
	createEtaIntegration,
} from '../../src/lib/projector/integration-with-eta.service';
import { randomEvents } from '../../src/lib/projector/test-support.helper';

const VECTOR = computeFeatureVector({ slice_count: 1 });
const ITEMS = ['p/S1', 'p/S2'];

const historyOf = (durations: readonly number[]) => {
	const store = new MemoryDurationHistoryStore({ medianGuard: false });
	for (const durationMs of durations) {
		store.recordDuration({
			vector: VECTOR,
			actorProfile: 'a',
			taskKind: 'k',
			durationMs,
			outcome: 'done',
		});
	}
	return store;
};

describe('ETA on top of the progress service', () => {
	it('leaves the projection untouched and only decorates what a reader gets', () => {
		const service = createWorkProgressService({ now: () => 0 });
		service.load(randomEvents(7, 60, ITEMS), []);
		const before = service.getSnapshot('p/S1');
		const eta = createEtaIntegration({
			source: historyOf([100, 200, 300, 400, 500]),
			describe: () => ({
				featureVector: VECTOR,
				actorProfile: 'a',
				taskKind: 'k',
				observedMs: 0,
			}),
		});
		expect(before).toBeDefined();
		if (before === undefined) return;
		const decorated = eta.annotate(before);
		expect(decorated.eta_p80_ms).toBe(400);
		expect(service.getSnapshot('p/S1')).toEqual(before);
		expect('eta_p80_ms' in before).toBe(false);
	});

	it('changes the verdict on a stalled item as the estimate does', () => {
		const stalled = {
			workItemId: 'p/S1',
			proposalId: 'p',
			sliceId: 'S1',
			phase: 'testing' as const,
			progress: 5,
			weight: 1,
			confidence: 0.5,
			uncertainty: 0.5,
			stalled: true,
			eventCount: 3,
			lastEventAt: 0,
		};
		const decide = (observedMs: number) => {
			const decorated = createEtaIntegration({
				source: historyOf([1000, 1000, 1000, 1000, 1000]),
				describe: () => ({
					featureVector: VECTOR,
					actorProfile: 'a',
					taskKind: 'k',
					observedMs,
				}),
			}).annotate(stalled);
			return classifyStalledByEta(decorated, observedMs);
		};
		expect(decide(950)).toBe('near-completion');
		expect(decide(50)).toBe('far-from-done');
	});
});
