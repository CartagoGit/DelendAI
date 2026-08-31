import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	measureCatalogAndTaskContextCost,
	renderCatalogAndTaskContextMarkdown,
} from '../measure/catalog-task-context-cost';
import {
	buildPerSurfaceColumns,
	buildTokenBudgetDashboardMarkdown,
} from './token-budget-dashboard.script';

const TOKEN_BUDGETS_ARTIFACT = new URL(
	'../../../docs/mcp-vertex/TOKEN-BUDGETS.md',
	import.meta.url,
);
const measurementPromise = measureCatalogAndTaskContextCost();

describe('token-budget dashboard publication', () => {
	it('builds the per-surface summary without inventing missing measurements', () => {
		const rows = buildPerSurfaceColumns([
			{
				presetId: 'demo',
				title: 'demo',
				surfaceMode: 'adaptive',
				runtimeSurface: 'managed',
				source: 'dynamic-client',
				pluginCount: 1,
				toolCount: 1,
				toolsListBytes: 800,
				schemaBytes: 600,
				descriptionBytes: 80,
				inputSchemaBytes: 200,
				outputSchemaBytes: 400,
				maxPluginBytes: 600,
				overviewCompactBytes: 200,
				roundContextBytes: null,
				loadErrors: [],
				ownerRows: [],
				toolBreakdowns: [],
				tokenizerEstimates: [],
			},
			{
				presetId: 'demo',
				title: 'demo',
				surfaceMode: 'native',
				runtimeSurface: 'managed',
				source: 'tokens-gate',
				pluginCount: 1,
				toolCount: 1,
				toolsListBytes: 1200,
				schemaBytes: 900,
				descriptionBytes: 120,
				inputSchemaBytes: 300,
				outputSchemaBytes: 600,
				maxPluginBytes: 700,
				overviewCompactBytes: 220,
				roundContextBytes: 180,
				loadErrors: [],
				ownerRows: [],
				toolBreakdowns: [],
				tokenizerEstimates: [],
			},
		]);

		expect(rows).toEqual([
			{
				presetId: 'demo',
				adaptiveBytes: 800,
				adaptiveStatus: 'n/a',
				nativeBytes: 1200,
				nativeStatus: 'n/a',
				adaptiveDeficit: null,
				nativeDeficit: null,
			},
		]);
	});

	it('renders the reproducible task_context_cost block with the fixed published values', {
		// The project-wide ceiling in `tools/vitest.config.ts` applies; a
		// narrower per-test timeout here made a busy machine look like a hang.
		timeout: 120_000,
	}, async () => {
		const measurement = await measurementPromise;
		const addendum = renderCatalogAndTaskContextMarkdown(measurement);

		expect(addendum).toContain('## Catalog and task context cost addendum');
		expect(addendum).toContain('| cold start | 682 | 171 |');
		expect(addendum).toContain('| after search.search | 738 | 185 |');
		expect(addendum).toContain('| after docs.docs_list | 786 | 197 |');
		expect(addendum).toContain('| after logs.tail | 834 | 209 |');
		expect(addendum).toContain('| p50 | 738 | 185 |');
		expect(addendum).toContain('| p95 | 834 | 209 |');
	});

	it('publishes the task_context_cost addendum from the dashboard generator output', {
		// The project-wide ceiling in `tools/vitest.config.ts` applies; a
		// narrower per-test timeout here made a busy machine look like a hang.
		timeout: 120_000,
	}, async () => {
		const [measurement, dashboardMarkdown] = await Promise.all([
			measurementPromise,
			buildTokenBudgetDashboardMarkdown(),
		]);
		const addendum = renderCatalogAndTaskContextMarkdown(measurement);

		expect(dashboardMarkdown).toContain(addendum);
	});

	it('keeps the published token budget artifact aligned with the generated addendum', {
		// The project-wide ceiling in `tools/vitest.config.ts` applies; a
		// narrower per-test timeout here made a busy machine look like a hang.
		timeout: 120_000,
	}, async () => {
		const measurement = await measurementPromise;
		const addendum = renderCatalogAndTaskContextMarkdown(measurement);
		const publishedArtifact = readFileSync(TOKEN_BUDGETS_ARTIFACT, 'utf8');

		expect(publishedArtifact).toContain(addendum);
	});
});
