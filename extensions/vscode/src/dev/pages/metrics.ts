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
import type { IMetricsSnapshot } from '@mcp-vertex/client';

import { renderMetricsBody } from '../../views/metrics-sparkline';

import type { IPage } from './contract';

const MOCK_METRICS: IMetricsSnapshot = {
	tools: {
		'mcp-vertex_search': {
			calls: 318,
			errors: 1,
			totalMs: 14_910,
			maxMs: 420,
			totalBytes: 0,
		},
		'mcp-vertex_overview': {
			calls: 412,
			errors: 2,
			totalMs: 7_416,
			maxMs: 80,
			totalBytes: 0,
		},
	},
	totals: { calls: 730, errors: 3, totalMs: 22_326, totalBytes: 0 },
};

export const createMetricsPage = (): IPage => ({
	id: 'metrics',
	label: 'metrics',
	render(root, _deps) {
		root.innerHTML = renderMetricsBody(MOCK_METRICS);
	},
});
