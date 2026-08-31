import { describe, expect, it } from 'vitest';

import {
	TASK_CONTEXT_CORPUS,
	measureCatalogAndTaskContextCost,
	nearestRankPercentile,
	summarizeBytePercentiles,
} from '../../../../../../tools/scripts/measure/catalog-task-context-cost';

describe('catalog-task-context-cost measurement', () => {
	it('computes nearest-rank percentiles for reproducible byte samples', () => {
		const samples = [682, 738, 786, 834];
		expect(nearestRankPercentile(samples, 50)).toBe(738);
		expect(nearestRankPercentile(samples, 95)).toBe(834);
		expect(summarizeBytePercentiles(samples)).toEqual({
			sampleCount: 4,
			p50Bytes: 738,
			p95Bytes: 834,
			p50EstimatedTokens: 185,
			p95EstimatedTokens: 209,
		});
	});

	it('measures catalog payloads and a reproducible swarm task-context corpus', async () => {
		const measurement = await measureCatalogAndTaskContextCost();
		expect(measurement.catalog.agentCatalog.compactBytes).toBeGreaterThan(
			0,
		);
		expect(measurement.catalog.agentCatalog.fullBytes).toBeGreaterThan(
			measurement.catalog.agentCatalog.compactBytes,
		);
		expect(measurement.catalog.nativeCore.toolCount).toBeGreaterThan(0);
		expect(measurement.catalog.swarmNative.toolCount).toBeGreaterThan(
			measurement.catalog.nativeCore.toolCount,
		);
		expect(
			measurement.catalog.swarmNative.ownerRows.some(
				(row) => row.owner === 'proposals',
			),
		).toBe(true);
		expect(
			measurement.taskContext.samples.map((sample) => sample.label),
		).toEqual(TASK_CONTEXT_CORPUS.map((step) => step.label));
		expect(measurement.taskContext.p50Bytes).toBeGreaterThanOrEqual(
			measurement.taskContext.samples[0]?.bytes ?? 0,
		);
		expect(measurement.taskContext.p95Bytes).toBeGreaterThanOrEqual(
			measurement.taskContext.p50Bytes,
		);
	});
});
