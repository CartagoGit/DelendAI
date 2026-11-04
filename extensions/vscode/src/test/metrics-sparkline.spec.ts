import { describe, expect, it } from 'vitest';

import {
	metricsToPoints,
	renderMetricsBody,
	renderMetricsHtml,
	renderMetricsSparkline,
} from '../views/metrics-sparkline';

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

const totals = (
	calls: number,
	errors: number,
	totalMs: number,
	totalBytes: number,
) => ({
	calls,
	errors,
	totalMs,
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

describe('metrics sparkline', async () => {
	it('turns a metrics snapshot into sorted points', async () => {
		expect(
			metricsToPoints({
				tools: {
					z_tool: metric(1, 0, 1, 1, 10),
					a_tool: metric(3, 0, 3, 2, 30),
				},
				totals: totals(4, 0, 4, 40),
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
			totals: totals(0, 0, 0, 0),
		});

		expect(html).toContain('delendai Metrics');
		expect(html).toContain('0 calls, 0 errors');
	});

	it('renders a body fragment without an outer <html> wrapper', async () => {
		const body = renderMetricsBody({
			tools: {},
			totals: totals(7, 1, 42, 0),
		});

		expect(body).toContain('delendai Metrics');
		expect(body).toContain('7 calls, 1 error');
		// The body renderer must not wrap its output in an
		// <html>/<head>/<body> shell — the dev preview mounts
		// the fragment inside its own <main>.
		expect(body).not.toContain('<!DOCTYPE');
		expect(body).not.toContain('<html');
		expect(body).not.toMatch(/<head>/);
	});
});
