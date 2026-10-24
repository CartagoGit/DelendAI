import { describe, expect, it } from 'vitest';

import { renderOutputSchema } from '../views/render-output-schema';
import { renderToolDetailHtml } from '../views/tool-detail-webview';

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

describe('renderOutputSchema', async () => {
	it('renders object schemas with required markers', async () => {
		const html = renderOutputSchema({
			type: 'object',
			required: ['name'],
			properties: {
				name: { type: 'string', description: 'Tool name' },
				compact: { type: 'boolean' },
			},
		});

		expect(html).toContain('<strong>compact</strong>');
		expect(html).toContain('<code>boolean</code>');
		expect(html).toContain('<span>optional</span>');
		expect(html).toContain('<strong>name</strong>');
		expect(html).toContain('<span>required</span>');
		expect(html).toContain('Tool name');
	});

	it('renders arrays and enum values', async () => {
		const html = renderOutputSchema({
			type: 'array',
			items: {
				type: 'string',
				enum: ['ready', 'in-progress'],
			},
		});

		expect(html).toContain('<strong>items</strong>');
		expect(html).toContain('enum: ready, in-progress');
	});
});

describe('renderToolDetailHtml', async () => {
	it('renders escaped tool details and metrics', async () => {
		const html = renderToolDetailHtml({
			tool: {
				name: 'demo_tool',
				plugin: 'demo',
				summary: '<unsafe>',
				tags: [],
				effects: [],
			},
			outputSchema: { type: 'object' },
			metrics: {
				tools: {
					demo_tool: metric(2, 1, 12, 9, 256),
				},
				totals: totals(2, 1, 12, 256),
			},
		});

		expect(html).toContain('&lt;unsafe&gt;');
		expect(html).toContain('2 calls, 1 error, max 9ms');
	});
});
