import { describe, expect, it } from 'vitest';

import {
	renderToolDetailBody,
	renderToolDetailHtml,
} from '../views/tool-detail-webview';

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

const MODEL = {
	tool: {
		name: 'delendai_search',
		plugin: 'search',
		summary: 'Low-token grep over workspace text files.',
		tags: ['search', 'read'],
		effects: [],
	},
	inputSchema: {
		type: 'object',
		properties: {
			query: { type: 'string' },
			maxResults: { type: 'number' },
		},
		required: ['query'],
	},
	outputSchema: {
		type: 'object',
		properties: { hits: { type: 'array' } },
	},
	knowledgeBody: '# search\n\nLow-token grep.',
	metrics: {
		tools: {
			delendai_search: metric(318, 1, 14_910, 420, 0),
		},
		totals: totals(318, 1, 14_910, 0),
	},
};

describe('tool-detail webview', () => {
	it('renders a full HTML document for the production webview', () => {
		const html = renderToolDetailHtml(MODEL);
		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('delendai_search');
		expect(html).toContain('Knowledge');
		expect(html).toContain('318 calls');
	});

	it('renders a body fragment without an outer <html> wrapper', () => {
		const body = renderToolDetailBody(MODEL);
		// Body renderer must NOT wrap its output in <html>/<head>/
		// <body>; the dev preview mounts the fragment inside its
		// own <main>, and a nested <html> would silently drop.
		expect(body).not.toContain('<!DOCTYPE');
		expect(body).not.toContain('<html');
		expect(body).not.toMatch(/<head>/);
		// It still has the real content.
		expect(body).toContain('delendai_search');
		expect(body).toContain('Knowledge');
		expect(body).toContain('318 calls');
	});
});
