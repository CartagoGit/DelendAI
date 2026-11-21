/**
 * token-budget-dashboard.e2e.spec.ts — the published token budget matches a
 * real measurement. Building the dashboard measures every preset on every
 * surface, so it runs in the e2e tier; the pure summary case stays in
 * token-budget-dashboard.spec.ts.
 *
 * @delendai-isolate: it boots every preset's plugins by dynamic import, which
 * must not run on a module graph shared with other files.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	measureCatalogAndTaskContextCost,
	renderCatalogAndTaskContextMarkdown,
} from '../measure/catalog-task-context-cost';
import { buildTokenBudgetDashboardMarkdown } from './token-budget-dashboard.script';

const TOKEN_BUDGETS_ARTIFACT = new URL(
	'../../../docs/delendai/TOKEN-BUDGETS.md',
	import.meta.url,
);
const measurementPromise = measureCatalogAndTaskContextCost();

describe('token-budget dashboard publication', () => {
	it('renders the reproducible task_context_cost block with the fixed published values', {
		// Building the dashboard measures every preset on every surface,
		// which took 124 s with the machine at a load of 75 on 10 cores. The
		// ceiling is a hang detector, so it sits well above what a loaded
		// machine needs rather than just above an idle one.
		timeout: 600_000,
	}, async () => {
		const measurement = await measurementPromise;
		const addendum = renderCatalogAndTaskContextMarkdown(measurement);

		expect(addendum).toContain('## Catalog and task context cost addendum');
		expect(addendum).toContain('| cold start | 388 | 97 |');
		expect(addendum).toContain('| after search.search | 413 | 104 |');
		expect(addendum).toContain('| after docs.docs_list | 434 | 109 |');
		expect(addendum).toContain('| after logs.tail | 456 | 114 |');
		expect(addendum).toContain('| p50 | 413 | 104 |');
		expect(addendum).toContain('| p95 | 456 | 114 |');
	});

	it('publishes the task_context_cost addendum from the dashboard generator output', {
		// Building the dashboard measures every preset on every surface,
		// which took 124 s with the machine at a load of 75 on 10 cores. The
		// ceiling is a hang detector, so it sits well above what a loaded
		// machine needs rather than just above an idle one.
		timeout: 600_000,
	}, async () => {
		const [measurement, dashboardMarkdown] = await Promise.all([
			measurementPromise,
			buildTokenBudgetDashboardMarkdown(),
		]);
		const addendum = renderCatalogAndTaskContextMarkdown(measurement);

		expect(dashboardMarkdown).toContain(addendum);
	});

	it('keeps the published token budget artifact aligned with the generated addendum', {
		// Building the dashboard measures every preset on every surface,
		// which took 124 s with the machine at a load of 75 on 10 cores. The
		// ceiling is a hang detector, so it sits well above what a loaded
		// machine needs rather than just above an idle one.
		timeout: 600_000,
	}, async () => {
		const measurement = await measurementPromise;
		const addendum = renderCatalogAndTaskContextMarkdown(measurement);
		const publishedArtifact = readFileSync(TOKEN_BUDGETS_ARTIFACT, 'utf8');

		expect(publishedArtifact).toContain(addendum);
	});
});
