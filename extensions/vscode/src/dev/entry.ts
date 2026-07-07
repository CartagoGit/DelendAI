/// <reference lib="dom" />
/**
 * `extensions/vscode` dev entry — renders the extension's webviews
 * against REAL workspace data when the workspace uses mcp-vertex, or a
 * setup wizard when it doesn't. Loaded by `tools/scripts/dev/dev.script.ts`
 * at `http://localhost:5200/__entry.js`.
 *
 * Data flow
 * ---------
 *   1. Browser calls `GET /api/setup/status` → server-side
 *      `detectSetupStatus(cwd)` reads the workspace files and reports
 *      whether mcp-vertex is configured.
 *   2. If `kind === 'configured'`, browser calls `GET /api/dashboard`
 *      and the server spawns the MCP stdio client to fetch a real
 *      `IDashboardAllModels`, which `renderDashboard` projects.
 *   3. If `kind !== 'configured'`, the entry renders a setup wizard
 *      with an "Install" button that POSTs `/api/setup/install` (the
 *      server writes `.vscode/mcp.json` + `.vscode/settings.json`,
 *      then refreshes).
 *
 * Why this is two-tier (browser → server → MCP)?
 *   - The browser bundle is browser-safe: no `node:fs`, no
 *     `cross-spawn`, no `child_process` (we proved earlier this is
 *     fragile).
 *   - The server runs in Bun (Node-like) and CAN spawn MCP stdio +
 *     read files. Doing it server-side keeps the contract clean.
 *   - The browser still exercises the real `renderDashboard` and
 *     `renderToolDetailHtml` renderer functions with real workspace
 *     data — only the data source is mocked vs. real.
 *
 * Sidebar
 * -------
 * The chooser keeps `tool-detail` and `metrics` (small previews) plus
 * the new `dashboard` view, which now transparently renders setup
 * wizard OR real dashboard depending on workspace state.
 */
import type {
	IDashboardAllModels,
	IMetricsSnapshot,
	IToolDescriptor,
} from '@mcp-vertex/client';
import {
	mockDashboardModel,
	renderDashboard,
} from '@mcp-vertex/ui-extension/webview';
import { dictsByLang } from '@mcp-vertex/shared/i18n';

import { renderMetricsHtml } from '../views/metrics-sparkline';
import { renderToolDetailHtml } from '../views/tool-detail-webview';

// ---------------------------------------------------------------------------
// Setup status shape (mirrors `tools/scripts/dev/api/setup-status.ts`).
// Kept inline so this file has zero server-side imports.
// ---------------------------------------------------------------------------

interface ISetupSignal {
	readonly id: string;
	readonly present: boolean;
	readonly path: string;
	readonly detail?: string;
}

interface ISetupStatus {
	readonly kind: 'configured' | 'partial' | 'unconfigured';
	readonly signals: readonly ISetupSignal[];
	readonly nextStep: 'spawn-mcp' | 'install' | 'manual';
	readonly suggestion: string;
}

interface IInstallResult {
	readonly ok: boolean;
	readonly written: readonly string[];
	readonly note: string;
}

type DashboardResult =
	| { readonly ok: true; readonly model: IDashboardAllModels }
	| { readonly ok: false; readonly kind: string; readonly message: string };

// ---------------------------------------------------------------------------
// Mocks for the small sidebar previews (tool-detail + metrics). These
// have no workspace meaning — they're just snapshots of what the
// renderer emits when called from the real extension's command
// surface. Kept local because the real values for these come from
// per-tool calls (mcp-vertex_metrics + a tool descriptor fetch) and
// wiring that whole loop into the dev preview would balloon this file.
// ---------------------------------------------------------------------------

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
	effects: [],
};

const mockMetrics: IMetricsSnapshot = {
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

const mockToolDetail: IToolDetailViewModel = {
	tool: mockTool,
	inputSchema: {
		type: 'object',
		properties: {
			query: { type: 'string' },
			maxResults: { type: 'number' },
		},
		required: ['query'],
	},
	outputSchema: { type: 'object', properties: { hits: { type: 'array' } } },
	knowledgeBody: '# search\n\nLow-token grep.',
	metrics: mockMetrics,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const escapeHtml = (s: string): string =>
	s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

const fetchJson = async <T>(path: string): Promise<T | null> => {
	try {
		const res = await fetch(path);
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
};

const renderSetupWizard = (status: ISetupStatus): string => {
	const signalsHtml = status.signals
		.map(
			(s) =>
				`<li class="setup__signal ${s.present ? 'is-on' : 'is-off'}">
					<span class="setup__signal-icon" aria-hidden="true">${s.present ? '✓' : '·'}</span>
					<code>${escapeHtml(s.path)}</code>
					${s.detail ? `<span class="setup__signal-detail">— ${escapeHtml(s.detail)}</span>` : ''}
				</li>`,
		)
		.join('');

	const ctaLabel =
		status.kind === 'partial'
			? 'Finish setup'
			: status.kind === 'unconfigured'
				? 'Install mcp-vertex here'
				: 'Re-install (idempotent)';

	return `<section class="setup" data-kind="${status.kind}">
		<header class="setup__head">
			<h1>mcp-vertex isn't fully wired in this workspace</h1>
			<p class="setup__hint">${escapeHtml(status.suggestion)}</p>
		</header>
		<aside class="setup__signals" aria-label="Detection signals">
			<h2>Detection</h2>
			<ul>${signalsHtml}</ul>
		</aside>
		<footer class="setup__cta">
			<button type="button" id="setup-install" class="setup__primary">${escapeHtml(ctaLabel)}</button>
			<button type="button" id="setup-refresh" class="setup__secondary">Re-check</button>
			<span class="setup__status" id="setup-status" role="status" aria-live="polite"></span>
		</footer>
	</section>`;
};

const renderDashboardOrSetup = async (root: HTMLElement): Promise<void> => {
	const status = await fetchJson<ISetupStatus>('/api/setup/status');
	if (!status) {
		root.innerHTML =
			'<p class="setup__hint">Dev server not reachable. Restart <code>bun run dev:vscode</code>.</p>';
		return;
	}

	if (status.kind !== 'configured') {
		root.innerHTML = renderSetupWizard(status);
		bindSetupHandlers(root);
		return;
	}

	// Configured: render dashboard with REAL data. Fall back to the
	// shared mock if the MCP server is unreachable, so the dev
	// preview never goes blank.
	const real = await fetchJson<DashboardResult>('/api/dashboard');
	const model =
		real && 'ok' in real && real.ok === true
			? real.model
			: mockDashboardModel;

	const html = renderDashboard(model, {
		docsUrl: 'https://cartagogit.github.io/mcp-vertex/',
		refreshCommand: 'mcp-vertex.refresh',
		openDocsCommand: 'mcp-vertex.openDocs',
		lang: dictsByLang.en,
	});
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	root.innerHTML = bodyMatch?.[1] ?? html;

	if (real && 'ok' in real && real.ok === false) {
		const note = document.createElement('p');
		note.className = 'setup__hint';
		note.textContent = `MCP server unreachable: ${real.message}. Showing mock data — start \`bun run mcp-vertex\` and click Refresh.`;
		root.prepend(note);
	}
};

const bindSetupHandlers = (root: HTMLElement): void => {
	const install = root.querySelector<HTMLButtonElement>('#setup-install');
	const refresh = root.querySelector<HTMLButtonElement>('#setup-refresh');
	const status = root.querySelector<HTMLSpanElement>('#setup-status');

	install?.addEventListener('click', async () => {
		if (!status) return;
		status.textContent = 'Installing…';
		install.disabled = true;
		const res = await fetch('/api/setup/install', { method: 'POST' });
		const body = (await res.json()) as IInstallResult | null;
		status.textContent = body?.note ?? 'Done.';
		setTimeout(() => void renderDashboardOrSetup(root), 800);
	});

	refresh?.addEventListener('click', () => {
		void renderDashboardOrSetup(root);
	});
};

// ---------------------------------------------------------------------------
// Sidebar chooser
// ---------------------------------------------------------------------------

const WEBVIEWS: ReadonlyArray<{
	id: string;
	label: string;
	render: (root: HTMLElement) => Promise<void> | void;
}> = [
	{
		id: 'dashboard',
		label: 'dashboard (workspace)',
		render: renderDashboardOrSetup,
	},
	{
		id: 'tool-detail',
		label: 'tool-detail (webview panel)',
		render: (root) => {
			root.innerHTML = renderToolDetailHtml(mockToolDetail);
		},
	},
	{
		id: 'metrics',
		label: 'metrics (sparkline)',
		render: (root) => {
			root.innerHTML = renderMetricsHtml(mockMetrics);
		},
	},
];

const root = document.getElementById('root');
if (!root) {
	throw new Error('dev entry: #root element missing in landing page');
}

const render = async (id: string): Promise<void> => {
	const view = WEBVIEWS.find((v) => v.id === id) ?? WEBVIEWS[0];
	if (!view) {
		root.innerHTML = '<p>No webviews registered.</p>';
		return;
	}
	try {
		await view.render(root);
	} catch (err) {
		const message =
			err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
		root.innerHTML = `<pre id="error">${escapeHtml(message)}</pre>`;
		console.error(`[dev:vscode] ${view.id} render failed`, err);
	}
	for (const btn of document.querySelectorAll<HTMLElement>(
		'[data-webview]',
	)) {
		btn.dataset.active = btn.dataset.webview === view.id ? 'true' : 'false';
	}
};

const sidebar = document.getElementById('sidebar');
if (sidebar) {
	sidebar.innerHTML = WEBVIEWS.map(
		(v) =>
			`<button type="button" data-webview="${v.id}">${v.label}</button>`,
	).join('');
	for (const btn of sidebar.querySelectorAll<HTMLElement>('[data-webview]')) {
		btn.addEventListener('click', () => {
			const id = btn.dataset.webview;
			if (id) void render(id);
		});
	}
}

void render(WEBVIEWS[0]?.id ?? '');
