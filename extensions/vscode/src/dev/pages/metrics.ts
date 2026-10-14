/**
 * `extensions/vscode/src/dev/pages/metrics.ts` — metrics view,
 * lazily loaded.
 *
 * The mock data is defined here so the entry bundle never
 * imports the metrics renderer / mock until the user clicks
 * the tab. The view itself uses the existing
 * `renderMetricsHtml` from `../views/metrics-sparkline.ts` —
 * imported statically because it is the only dependency this
 * page carries.
 */
import type { IMetricsSnapshot } from '@delendai/client';

import { renderMetricsBody } from '../../views/metrics-sparkline';
import { viewCopyFor } from '../../i18n/view-copy.strings';

import type { IPage } from './contract';

const metric = (
	calls: number,
	errors: number,
	totalMs: number,
	maxMs: number,
	totalBytes: number,
) => ({
	calls,
	errors,
	totalMs,
	maxMs,
	totalBytes,
	cost: {
		contentTextBytes: totalBytes,
		structuredJsonBytes: 0,
		wireEstimateBytes: totalBytes,
		estimatedTokens: {
			estimatedTokens4B: Math.ceil(totalBytes / 4),
		},
	},
});

const MOCK_METRICS: IMetricsSnapshot = {
	tools: {
		delendai_search: metric(318, 1, 14_910, 420, 0),
		delendai_overview: metric(412, 2, 7_416, 80, 0),
	},
	totals: {
		calls: 730,
		errors: 3,
		totalMs: 22_326,
		totalBytes: 0,
		cost: {
			contentTextBytes: 0,
			structuredJsonBytes: 0,
			wireEstimateBytes: 0,
			estimatedTokens: {
				estimatedTokens4B: 0,
			},
		},
	},
};

export const createMetricsPage = (): IPage => ({
	id: 'metrics',
	label: 'metrics',
	render(root, deps) {
		root.innerHTML = renderMetricsBody(
			MOCK_METRICS,
			viewCopyFor(deps.lang),
		);
	},
});
