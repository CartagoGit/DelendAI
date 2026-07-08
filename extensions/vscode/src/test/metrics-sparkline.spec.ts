import { describe, expect, it } from 'vitest';

import {
	metricsToPoints,
	renderMetricsBody,
	renderMetricsHtml,
	renderMetricsSparkline,
} from '../views/metrics-sparkline';

describe('metrics sparkline', async () => {
	it('turns a metrics snapshot into sorted points', async () => {
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

	it('renders a tiny inline svg', async () => {
		expect(
			renderMetricsSparkline([
				{ label: 'a', value: 0 },
				{ label: 'b', value: 2 },
			]),
		).toBe(
			'<svg class="metrics__sparkline" viewBox="0 0 480 96" role="img" aria-label="a:0 b:2"><polyline fill="none" stroke="currentColor" stroke-width="2" points="0,96 480,0" /></svg>',
		);
	});

	it('renders metrics html summary', async () => {
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

	it('renders a body fragment without an outer <html> wrapper', async () => {
		const body = renderMetricsBody({
			tools: {},
			totals: {
				calls: 7,
				errors: 1,
				totalMs: 42,
				totalBytes: 0,
			},
		});

		expect(body).toContain('mcp-vertex Metrics');
		expect(body).toContain('7 calls, 1 errors');
		// The body renderer must not wrap its output in an
		// <html>/<head>/<body> shell — the dev preview mounts
		// the fragment inside its own <main>.
		expect(body).not.toContain('<!DOCTYPE');
		expect(body).not.toContain('<html');
		expect(body).not.toMatch(/<head>/);
	});
});
