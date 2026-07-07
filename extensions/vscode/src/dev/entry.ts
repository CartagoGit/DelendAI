/// <reference lib="dom" />
/**
 * `extensions/vscode` dev entry — renders the extension's webviews
 * against REAL workspace data when the workspace uses mcp-vertex, or a
 * setup wizard + theme/language picker (always reachable via the
 * Settings tab) when it doesn't. Loaded by `tools/scripts/dev/dev.script.ts`
 * at `http://localhost:5200/__entry.js`.
 *
 * Layout
 * ------
 * Sidebar buttons:
 *   - **dashboard** (default) — the rich dashboard with REAL data
 *     (or the shared mock if MCP is unreachable). When the workspace
 *     isn't configured, the dashboard renders BELOW a top-of-page
 *     banner that surfaces the same status the wizard would show,
 *     with a single click into the Settings tab. The wizard no
 *     longer hijacks the dashboard view.
 *   - **settings** — the wizard (always reachable) + theme picker
 *     (system/light/dark) + language picker (the 12 shipped i18n
 *     dicts).
 *   - **tool-detail** — static preview of the tool-detail webview
 *     panel.
 *   - **metrics** — static preview of the metrics sparkline.
 *
 * Persistence
 * -----------
 * Theme + language are stored in `localStorage` under `mv:dev:theme`
 * and `mv:dev:lang`. They survive a page reload and apply on first
 * paint. In production (the real VS Code extension), these read
 * from `vscode.ExtensionContext.globalState` under `mv:theme` /
 * `mv:lang` instead — the dev preview deliberately uses different
 * keys so dev-only choices don't leak into the user's editor
 * settings.
 *
 * Server-side helpers
 * -------------------
 * `/api/setup/status` returns the workspace detection ladder (see
 * `tools/scripts/dev/api/setup-status.ts`). `/api/setup/install`
 * writes `.vscode/mcp.json` + `.vscode/settings.json` +
 * `mcp-vertex.config.json` idempotently. Both run server-side
 * (Bun, Node-like) — the browser bundle stays free of `node:fs` /
 * `cross-spawn` / `child_process` (we proved this contract earlier).
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
import type { Lang } from '@mcp-vertex/shared/i18n';
import { dictsByLang } from '@mcp-vertex/shared/i18n';

import { renderMetricsHtml } from '../views/metrics-sparkline';
import { renderToolDetailHtml } from '../views/tool-detail-webview';
import {
	bootstrapPersistedPrefs,
	getDict,
	mountSettingsPanel,
	readPersistedPrefs,
	type ISetupStatus,
	type WorkspaceKind,
} from './settings-panel';

// ---------------------------------------------------------------------------
// Static previews (tool-detail + metrics). Tool-detail will read real
// data in a future slice; metrics already mirrors the real metrics
// snapshot shape.
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

type DashboardResult =
	| { readonly ok: true; readonly model: IDashboardAllModels }
	| { readonly ok: false; readonly kind: string; readonly message: string };

interface IInstallResult {
	readonly ok: boolean;
	readonly note: string;
}

const bannerKindClass = (kind: WorkspaceKind): string => {
	if (kind === 'configured') return 'banner--ok';
	if (kind === 'partial') return 'banner--warn';
	return 'banner--err';
};

const renderStatusBanner = (
	status: ISetupStatus,
	onOpenSettings: () => void,
): string => {
	if (status.kind === 'configured') {
		return `<aside class="mv-banner banner--ok" role="status">
			<span class="mv-banner__icon" aria-hidden="true">✓</span>
			<span class="mv-banner__msg">Workspace is configured — the dashboard below is fetching real data when the MCP server is reachable.</span>
			<button type="button" class="mv-banner__link" data-action="open-settings">Open settings</button>
		</aside>`;
	}
	const verb = status.kind === 'partial' ? 'Finish' : 'Run';
	return `<aside class="mv-banner ${bannerKindClass(status.kind)}" role="status">
		<span class="mv-banner__icon" aria-hidden="true">!</span>
		<span class="mv-banner__msg">${escapeHtml(verb)} the setup: ${escapeHtml(status.suggestion)}</span>
		<button type="button" class="mv-banner__link" data-action="open-settings">Open settings →</button>
	</aside>`;
};

const renderDashboardView = async (
	root: HTMLElement,
	prefs: ReturnType<typeof readPersistedPrefs>,
): Promise<void> => {
	const status = await fetchJson<ISetupStatus>('/api/setup/status');

	const real = await fetchJson<DashboardResult>('/api/dashboard');
	const model =
		real && 'ok' in real && real.ok === true
			? real.model
			: mockDashboardModel;

	const dict = getDict(prefs.lang);
	const html = renderDashboard(model, {
		docsUrl: 'https://cartagogit.github.io/mcp-vertex/',
		refreshCommand: 'mcp-vertex.refresh',
		openDocsCommand: 'mcp-vertex.openDocs',
		lang: dict,
	});
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

	if (status) {
		root.innerHTML = `${renderStatusBanner(
			status,
			() => void render('settings'),
		)}${bodyMatch?.[1] ?? html}`;
	} else {
		root.innerHTML =
			bodyMatch?.[1] ??
			html ??
			'<p class="setup__hint">Dev server not reachable. Restart <code>bun run dev:vscode</code>.</p>';
	}

	// Wire the banner's "Open settings" link to a real navigation.
	for (const btn of root.querySelectorAll<HTMLButtonElement>(
		'[data-action="open-settings"]',
	)) {
		btn.addEventListener('click', () => void render('settings'));
	}

	if (real && 'ok' in real && real.ok === false) {
		const note = document.createElement('p');
		note.className = 'mv-banner banner--warn';
		note.style.margin = '0';
		note.textContent = `MCP server unreachable: ${real.message}. Showing mock data — start \`bun run mcp-vertex\` and click Refresh.`;
		root.prepend(note);
	}
};

const renderSettingsView = async (
	root: HTMLElement,
	prefs: ReturnType<typeof readPersistedPrefs>,
): Promise<void> => {
	let status = await fetchJson<ISetupStatus>('/api/setup/status');
	if (!status) {
		// Empty status object — the wizard treats this as "unconfigured"
		// by default because every signal is `present: false`.
		status = {
			kind: 'unconfigured',
			signals: [],
			nextStep: 'manual',
			suggestion:
				'Dev server unreachable — could not detect workspace state.',
		};
	}

	let currentLang: Lang = prefs.lang;
	const handleLangChange = (lang: Lang): void => {
		currentLang = lang;
		// Persisted (already done by the panel); re-render the dashboard
		// if it is the active view so it picks up the new dict.
		prefs = { ...prefs, lang };
		if (activeView === 'dashboard') void render('dashboard');
	};
	activeView = 'settings';

	mountSettingsPanel(
		root,
		status,
		prefs,
		async () => {
			const res = await fetch('/api/setup/install', { method: 'POST' });
			const body = (await res.json()) as IInstallResult | null;
			return body ? { note: body.note } : null;
		},
		handleLangChange,
	);
};

const renderToolDetailView = (root: HTMLElement): void => {
	root.innerHTML = renderToolDetailHtml(mockToolDetail);
};

const renderMetricsView = (root: HTMLElement): void => {
	root.innerHTML = renderMetricsHtml(mockMetrics);
};

// ---------------------------------------------------------------------------
// Sidebar chooser
// ---------------------------------------------------------------------------

interface IWebviewSpec {
	readonly id: string;
	readonly label: string;
	render: (
		root: HTMLElement,
		prefs: ReturnType<typeof readPersistedPrefs>,
	) => Promise<void> | void;
}

const WEBVIEWS: ReadonlyArray<IWebviewSpec> = [
	{
		id: 'dashboard',
		label: 'dashboard',
		render: renderDashboardView,
	},
	{
		id: 'settings',
		label: 'settings',
		render: renderSettingsView,
	},
	{
		id: 'tool-detail',
		label: 'tool-detail',
		render: (root) => renderToolDetailView(root),
	},
	{
		id: 'metrics',
		label: 'metrics',
		render: (root) => renderMetricsView(root),
	},
];

const root = document.getElementById('root');
if (!root) {
	throw new Error('dev entry: #root element missing in landing page');
}

let activeView = 'dashboard';

const render = async (id: string): Promise<void> => {
	const view = WEBVIEWS.find((v) => v.id === id) ?? WEBVIEWS[0];
	if (!view) {
		root.innerHTML = '<p>No webviews registered.</p>';
		return;
	}
	activeView = view.id;
	try {
		// Re-read prefs on every navigation so a Settings-tab change
		// is picked up immediately on the dashboard.
		const prefs = readPersistedPrefs();
		await view.render(root, prefs);
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
			`<button type="button" data-webview="${v.id}">${escapeHtml(v.label)}</button>`,
	).join('');
	for (const btn of sidebar.querySelectorAll<HTMLElement>('[data-webview]')) {
		btn.addEventListener('click', () => {
			const id = btn.dataset.webview;
			if (id) void render(id);
		});
	}
}

// First paint: apply persisted prefs (theme on <html>) before any
// view renders, so the dashboard CSS sees the right data-theme.
const initialPrefs = bootstrapPersistedPrefs();
void render(WEBVIEWS[0]?.id ?? 'dashboard').catch((err) => {
	console.error('[dev:vscode] initial render failed', err);
});

// Expose for ad-hoc inspection in the devtools console. Cheap and
// keeps the panel imports discoverable without polluting globals.
declare global {
	interface Window {
		__mvDev?: {
			render: (id: string) => Promise<void>;
			prefs: typeof initialPrefs;
		};
	}
}
window.__mvDev = {
	render,
	prefs: initialPrefs,
};

// Re-export so unused-import lints do not strip the dictsByLang import
// in environments where it isn't directly referenced (it IS referenced
// by getDict()).
export const __keepDictsByLangRef = dictsByLang;
