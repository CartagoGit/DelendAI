/**
 * `extensions/vscode/src/dev/pages/tool-detail.ts` —
 * tool-detail view, lazily loaded.
 *
 * The mock data lives here (not in `entry.ts`) so the entry
 * bundle does not import it until the user clicks the tab.
 * The tool-detail view itself uses the existing
 * `renderToolDetailHtml` from
 * `../views/tool-detail-webview.ts` — that module is imported
 * statically inside this file because it is the only thing
 * this page needs; the entry bundle never sees it.
 */
import type { IMetricsSnapshot, IToolDescriptor } from '@delendai/client';

import { renderToolDetailBody } from '../../views/tool-detail-webview';

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

interface IToolDetailViewModel {
	readonly tool: IToolDescriptor;
	readonly inputSchema?: object;
	readonly outputSchema?: object;
	readonly knowledgeBody?: string;
	readonly metrics?: IMetricsSnapshot;
}

const MOCK_TOOL: IToolDescriptor = {
	name: 'mcp-vertex_search',
	plugin: 'search',
	summary: 'Low-token grep over workspace text files.',
	tags: ['search', 'read'],
	effects: [],
};

const MOCK_METRICS: IMetricsSnapshot = {
	tools: {
		'mcp-vertex_search': metric(318, 1, 14_910, 420, 0),
		'mcp-vertex_overview': metric(412, 2, 7_416, 80, 0),
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

const MOCK_VIEW_MODEL: IToolDetailViewModel = {
	tool: MOCK_TOOL,
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
	metrics: MOCK_METRICS,
};

export const createToolDetailPage = (): IPage => ({
	id: 'tool-detail',
	label: 'tool-detail',
	render(root, _deps) {
		root.innerHTML = renderToolDetailBody(MOCK_VIEW_MODEL);
	},
});
