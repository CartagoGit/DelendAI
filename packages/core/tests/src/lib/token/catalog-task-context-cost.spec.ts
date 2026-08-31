import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	TASK_CONTEXT_CORPUS,
	measureCatalogAndTaskContextCost,
	nearestRankPercentile,
	renderCatalogAndTaskContextMarkdown,
	summarizeBytePercentiles,
} from '../../../../../../tools/scripts/measure/catalog-task-context-cost';

const TOKEN_BUDGETS_ARTIFACT = new URL(
	'../../../../../../docs/mcp-vertex/TOKEN-BUDGETS.md',
	import.meta.url,
);
const measurementPromise = measureCatalogAndTaskContextCost();

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
		const measurement = await measurementPromise;
		expect(measurement.catalog.agentCatalog).toEqual({
			compactBytes: 743,
			compactEstimatedTokens: 186,
			fullBytes: 9519,
			fullEstimatedTokens: 2380,
		});
		expect(measurement.catalog.nativeCore).toMatchObject({
			label: 'native core catalog',
			toolCount: 28,
			toolsListBytes: 42768,
			estimatedTokens: 10692,
			schemaBytes: 36508,
			inputSchemaBytes: 11533,
			outputSchemaBytes: 24975,
			maxPluginBytes: 0,
		});
		expect(measurement.catalog.swarmNative).toMatchObject({
			label: 'swarm native preset',
			toolCount: 165,
			toolsListBytes: 194452,
			estimatedTokens: 48613,
			schemaBytes: 158995,
			inputSchemaBytes: 47520,
			outputSchemaBytes: 111475,
			maxPluginBytes: 49615,
		});
		expect(
			measurement.catalog.swarmNative.ownerRows.find(
				(row) => row.owner === 'proposals',
			),
		).toEqual({
			owner: 'proposals',
			toolCount: 34,
			toolsListBytes: 49615,
			schemaBytes: 41727,
			descriptionBytes: 3364,
			inputSchemaBytes: 9796,
			outputSchemaBytes: 31931,
			annotationsBytes: 0,
			otherFieldBytes: 918,
			envelopeBytes: 2312,
		});
		expect(measurement.taskContext).toEqual({
			presetId: 'swarm',
			surfaceMode: 'managed',
			route: 'core.project_context via vertex',
			samples: [
				{
					label: 'cold start',
					bytes: 682,
					estimatedTokens: 171,
				},
				{
					label: 'after search.search',
					bytes: 738,
					estimatedTokens: 185,
				},
				{
					label: 'after docs.docs_list',
					bytes: 786,
					estimatedTokens: 197,
				},
				{
					label: 'after logs.tail',
					bytes: 834,
					estimatedTokens: 209,
				},
			],
			sampleCount: 4,
			p50Bytes: 738,
			p95Bytes: 834,
			p50EstimatedTokens: 185,
			p95EstimatedTokens: 209,
		});
		expect(
			measurement.taskContext.samples.map((sample) => sample.label),
		).toEqual(TASK_CONTEXT_CORPUS.map((step) => step.label));
	});

	it('keeps the published token budget artifact aligned with the measured addendum', async () => {
		const measurement = await measurementPromise;
		const publishedArtifact = readFileSync(TOKEN_BUDGETS_ARTIFACT, 'utf8');

		expect(publishedArtifact).toContain(
			renderCatalogAndTaskContextMarkdown(measurement),
		);
	});
});
