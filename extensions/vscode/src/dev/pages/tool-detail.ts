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
import type { IMetricsSnapshot, IToolDescriptor } from '@mcp-vertex/client';

import { renderToolDetailHtml } from '../../views/tool-detail-webview';

import type { IPage } from './contract';

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
		root.innerHTML = renderToolDetailHtml(MOCK_VIEW_MODEL);
	},
});
