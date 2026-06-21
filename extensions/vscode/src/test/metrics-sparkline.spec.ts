import { describe, expect, it } from 'vitest';

import {
	metricsToPoints,
	renderMetricsHtml,
	renderMetricsSparkline,
} from '../views/metrics-sparkline';

describe('metrics sparkline', () => {
	it('turns a metrics snapshot into sorted points', () => {
		expect(
			metricsToPoints({
				tools: {
					z_tool: {
						calls: 1,
						errors: 0,
						totalMs: 1,
						maxMs: 1,
						totalBytes: 10,
					},
					a_tool: {
						calls: 3,
						errors: 0,
						totalMs: 3,
						maxMs: 2,
						totalBytes: 30,
					},
				},
				totals: {
					calls: 4,
					errors: 0,
					totalMs: 4,
					totalBytes: 40,
				},
			}),
		).toEqual([
			{ label: 'a_tool', value: 3 },
			{ label: 'z_tool', value: 1 },
		]);
	});

	it('renders a tiny inline svg', () => {
		expect(
			renderMetricsSparkline([
				{ label: 'a', value: 0 },
				{ label: 'b', value: 2 },
			]),
		).toBe(
			'<svg viewBox="0 0 240 48" role="img" aria-label="a:0 b:2"><polyline fill="none" stroke="currentColor" stroke-width="2" points="0,48 240,0" /></svg>',
		);
	});

	it('renders metrics html summary', () => {
		const html = renderMetricsHtml({
			tools: {},
			totals: {
				calls: 0,
				errors: 0,
				totalMs: 0,
				totalBytes: 0,
			},
		});

		expect(html).toContain('mcp-vertex Metrics');
		expect(html).toContain('0 calls, 0 errors');
	});
});
