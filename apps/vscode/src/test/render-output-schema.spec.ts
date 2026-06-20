import { describe, expect, it } from 'vitest';

import { renderOutputSchema } from '../views/render-output-schema';
import { renderToolDetailHtml } from '../views/tool-detail-webview';

describe('renderOutputSchema', () => {
	it('renders object schemas with required markers', () => {
		const html = renderOutputSchema({
			type: 'object',
			required: ['name'],
			properties: {
				name: { type: 'string', description: 'Tool name' },
				compact: { type: 'boolean' },
			},
		});

		expect(html).toContain(
			'<strong>compact</strong> <span>optional</span>',
		);
		expect(html).toContain('<strong>name</strong> <span>required</span>');
		expect(html).toContain('Tool name');
	});

	it('renders arrays and enum values', () => {
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

describe('renderToolDetailHtml', () => {
	it('renders escaped tool details and metrics', () => {
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
					demo_tool: {
						calls: 2,
						errors: 1,
						totalMs: 12,
						maxMs: 9,
						totalBytes: 256,
					},
				},
				totals: {
					calls: 2,
					errors: 1,
					totalMs: 12,
					totalBytes: 256,
				},
			},
		});

		expect(html).toContain('&lt;unsafe&gt;');
		expect(html).toContain('2 calls, 1 errors, max 9ms');
	});
});
