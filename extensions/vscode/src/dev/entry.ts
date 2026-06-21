/**
 * `apps/vscode` dev entry — renders the extension's webviews with
 * mock data in a regular browser. Loaded by
 * `tools/scripts/dev/dev.script.ts` at
 * `http://localhost:5200/__entry.js`.
 *
 * What this gives you:
 *  - A preview of `renderToolDetailHtml(model)` and
 *    `renderMetricsHtml(snapshot)` without launching VS Code.
 *  - All workspace imports (`@mcp-vertex/client`) resolved by Bun's
 *    bundler from the monorepo's workspace symlinks.
 *
 * What this does NOT give you (by design):
 *  - The `vscode.acquireVsCodeApi()` bridge — the dev entry only
 *    exercises the **renderer** layer (pure string → string). Buttons
 *    that try to postMessage will be no-ops; that's expected.
 *  - The exact webview chrome (toolbar, status bar, etc.) — those are
 *    added by VS Code around the returned HTML string.
 *
 * The dev page is a chooser: pick a webview in the sidebar and the
 * right pane shows the rendered HTML. This mirrors the way the
 * extension surfaces them in production.
 */
import type { IMetricsSnapshot, IToolDescriptor } from '@mcp-vertex/client';

import { renderMetricsHtml } from '../views/metrics-sparkline';
import { renderToolDetailHtml } from '../views/tool-detail-webview';

interface IToolDetailViewModel {
	readonly tool: IToolDescriptor;
	readonly inputSchema?: object;
	readonly outputSchema?: object;
	readonly knowledgeBody?: string;
	readonly metrics?: IMetricsSnapshot;
}

const mockTool: IToolDescriptor = {
	name: 'mcp-vertex_search',
	plugin: 'search',
	summary: 'Low-token grep over workspace text files.',
	tags: ['search', 'read'],
	effects: ['read'],
};

const mockMetrics: IMetricsSnapshot = {
	tools: {
		'mcp-vertex_search': {
			tool: 'mcp-vertex_search',
			plugin: 'search',
			calls: 318,
			errors: 1,
			totalMs: 14_910,
			maxMs: 420,
			avgMs: 47,
			totalBytes: 0,
			tokens: 0,
		},
		'mcp-vertex_overview': {
			tool: 'mcp-vertex_overview',
			plugin: 'core',
			calls: 412,
			errors: 2,
			totalMs: 7_416,
			maxMs: 80,
			avgMs: 18,
			totalBytes: 0,
			tokens: 0,
		},
		'mcp-vertex_proposals_board': {
			tool: 'mcp-vertex_proposals_board',
			plugin: 'proposals',
			calls: 211,
			errors: 0,
			totalMs: 19_412,
			maxMs: 230,
			avgMs: 92,
			totalBytes: 0,
			tokens: 0,
		},
		'mcp-vertex_memory_recall': {
			tool: 'mcp-vertex_memory_recall',
			plugin: 'memory',
			calls: 88,
			errors: 0,
			totalMs: 1_936,
			maxMs: 60,
			avgMs: 22,
			totalBytes: 0,
			tokens: 0,
		},
	},
	totals: { calls: 1029, errors: 3, avgMs: 39 },
};

const mockToolDetail: IToolDetailViewModel = {
	tool: mockTool,
	inputSchema: {
		type: 'object',
		description: 'Search input',
		properties: {
			query: { type: 'string', description: 'Substring or regex' },
			maxResults: { type: 'number', description: 'Cap on hits' },
			include: {
				type: 'array',
				items: { type: 'string' },
				description: 'Glob patterns to include',
			},
		},
		required: ['query'],
	},
	outputSchema: {
		type: 'object',
		properties: {
			hits: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						file: { type: 'string' },
						line: { type: 'number' },
						text: { type: 'string' },
					},
				},
			},
		},
	},
	knowledgeBody:
		'# search\n\nLow-token grep. `mcp-vertex_search` returns the matching lines, not the full file.\nUse `include: ["src/**/*.ts"]` to scope the walk.',
	metrics: mockMetrics,
};

const WEBVIEWS: ReadonlyArray<{
	id: string;
	label: string;
	render: () => string;
}> = [
	{
		id: 'tool-detail',
		label: 'tool-detail (webview panel)',
		render: () => renderToolDetailHtml(mockToolDetail),
	},
	{
		id: 'metrics',
		label: 'metrics (sparkline)',
		render: () => renderMetricsHtml(mockMetrics),
	},
];

const root = document.getElementById('root');
if (!root) {
	throw new Error('dev entry: #root element missing in landing page');
}

const render = (id: string): void => {
	const view = WEBVIEWS.find((v) => v.id === id) ?? WEBVIEWS[0];
	if (!view) {
		root.innerHTML = '<p>No webviews registered.</p>';
		return;
	}
	try {
		const html = view.render();
		const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
		root.innerHTML = bodyMatch?.[1] ?? html;
	} catch (err) {
		const message =
			err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
		root.innerHTML = `<pre id="error">${message}</pre>`;
		console.error(`[dev:vscode] ${view.id} render failed`, err);
	}
	// Highlight the active item in the sidebar.
	for (const btn of document.querySelectorAll<HTMLElement>(
		'[data-webview]',
	)) {
		btn.dataset['active'] =
			btn.dataset['webview'] === view.id ? 'true' : 'false';
	}
};

// Render the sidebar (chooser) into the page header area.
const sidebar = document.getElementById('sidebar');
if (sidebar) {
	sidebar.innerHTML = WEBVIEWS.map(
		(v) =>
			`<button type="button" data-webview="${v.id}">${v.label}</button>`,
	).join('');
	for (const btn of sidebar.querySelectorAll<HTMLElement>('[data-webview]')) {
		btn.addEventListener('click', () => {
			const id = btn.dataset['webview'];
			if (id) render(id);
		});
	}
}

render(WEBVIEWS[0]?.id ?? '');
