/// <reference lib="dom" />
/**
 * `extensions/vscode` dev entry — top-level orchestration for the dev
 * preview at `http://localhost:5200`.
 *
 * Navigation model
 * ----------------
 * The sidebar has four views (Dashboard, Settings, Tool detail, Metrics).
 * The Dashboard view behaves differently depending on workspace state:
 *
 *   - **First-run / not configured** → render the welcome screen
 *     (4-card explainer + "Install" CTA + "Skip" link) instead of
 *     the dashboard. The wizard lives in the Settings tab and is
 *     always reachable from there.
 *   - **Configured** → render the dashboard with a Quick-start menu
 *     on top (collapsible, session-scoped).
 *   - **Configured but MCP unreachable** → same as above, plus a
 *     banner explaining the fallback to mock data.
 *
 * State
 * -----
 * The active view ID lives in `./state.ts` (not a module-local let in
 * this file) so `settings-panel.ts` can also see and update it. A
 * single source of truth prevents the "activeView is undefined"
 * bug we shipped in the previous slice.
 *
 * Helpers
 * -------
 * `fetchJson<T>` wraps `fetch` + JSON parse + a try/catch. Anything
 * the server doesn't know about returns `null` and the caller can
 * fall back to a default. Used by both status detection and dashboard
 * data fetch.
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
} from './settings-panel';
import {
	dismissQuickStart,
	isQuickStartDismissed,
	renderFirstRunScreen,
	renderQuickStartMenu,
} from './welcome';
import { getActiveView, setActiveView, type ViewId } from './state';

// ---------------------------------------------------------------------------
// Static previews (tool-detail + metrics).
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

const extractDashboardBody = (html: string): string => {
	// `renderDashboard` returns a full `<html>...</html>` document. The
	// root element the dev page mounts into already has its own
	// `<html>`, so we extract the body's inner content. If the renderer
	// ever changes shape (or returns an empty string), fall back to the
	// empty string instead of `'undefined'` — that was the bug that
	// made `bodyMatch?.[1] ?? html` print the literal word "undefined"
	// when the renderer returned a partial document.
	const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	return match?.[1] ?? '';
};

// ---------------------------------------------------------------------------
// Welcome screen (first-run)
// ---------------------------------------------------------------------------

const renderWelcome = (root: HTMLElement): void => {
	root.innerHTML = renderFirstRunScreen(
		'Install mcp-vertex in this workspace',
	);
	const installBtn =
		root.querySelector<HTMLButtonElement>('#welcome-install');
	installBtn?.addEventListener('click', () => void render('settings'));
	const skipBtn = root.querySelector<HTMLButtonElement>('#welcome-skip');
	skipBtn?.addEventListener('click', () => {
		setActiveView('dashboard');
		void render('dashboard');
	});
};

// ---------------------------------------------------------------------------
// Dashboard view
// ---------------------------------------------------------------------------

const renderDashboardView = async (root: HTMLElement): Promise<void> => {
	const prefs = readPersistedPrefs();
	const status = await fetchJson<ISetupStatus>('/api/setup/status');

	// Unconfigured workspace: hand off to the welcome screen. The
	// "Skip — show me the dashboard anyway" button on that screen
	// lets the user preview the UI even without the MCP server.
	if (status && status.kind !== 'configured') {
		renderWelcome(root);
		return;
	}

	// Configured: fetch real data, fall back to mock if unreachable.
	const real = await fetchJson<DashboardResult>('/api/dashboard');
	const model =
		real && 'ok' in real && real.ok === true
			? real.model
			: mockDashboardModel;

	const html = renderDashboard(model, {
		docsUrl: 'https://cartagogit.github.io/mcp-vertex/',
		refreshCommand: 'mcp-vertex.refresh',
		openDocsCommand: 'mcp-vertex.openDocs',
		lang: getDict(prefs.lang),
	});
	const body = extractDashboardBody(html);

	const fragments: string[] = [];
	if (!isQuickStartDismissed()) fragments.push(renderQuickStartMenu());
	fragments.push(body);

	root.innerHTML = fragments.join('\n');

	// Bind the quickstart dismiss button.
	root.querySelector<HTMLButtonElement>(
		'#quickstart-dismiss',
	)?.addEventListener('click', () => {
		dismissQuickStart();
		const menu = root.querySelector('.quickstart');
		menu?.remove();
	});

	// Surfaces the MCP-unreachable warning (when the API succeeded
	// but the response was a structured `IApiError` envelope).
	if (real && 'ok' in real && real.ok === false) {
		const note = document.createElement('p');
		note.className = 'mv-banner banner--warn';
		note.style.margin = '0';
		note.textContent = `MCP server unreachable: ${real.message}. Showing mock data — start \`bun run mcp-vertex\` and click Refresh.`;
		const quickstart = root.querySelector('.quickstart');
		quickstart
			? quickstart.insertAdjacentElement('afterend', note)
			: root.prepend(note);
	}
};

// ---------------------------------------------------------------------------
// Settings view
// ---------------------------------------------------------------------------

const renderSettingsView = async (
	root: HTMLElement,
	prefs: ReturnType<typeof readPersistedPrefs>,
): Promise<void> => {
	let status = await fetchJson<ISetupStatus>('/api/setup/status');
	if (!status) {
		status = {
			kind: 'unconfigured',
			signals: [],
			nextStep: 'manual',
			suggestion:
				'Dev server unreachable — could not detect workspace state.',
		};
	}

	// Keep prefs mutable so a language change forces the dashboard
	// view to re-render with the new dict.
	let currentPrefs = prefs;
	const handleLangChange = (lang: Lang): void => {
		currentPrefs = { ...currentPrefs, lang };
		// Only re-render the dashboard if it is the live view. Reading
		// the active view through `state.getActiveView()` is the fix
		// for the previous slice's bug where the closure-local variable
		// was always out of date.
		if (getActiveView() === 'dashboard') void render('dashboard');
	};

	mountSettingsPanel(
		root,
		status,
		currentPrefs,
		async () => {
			const res = await fetch('/api/setup/install', { method: 'POST' });
			const body = (await res.json()) as IInstallResult | null;
			return body ? { note: body.note } : null;
		},
		handleLangChange,
	);
};

// ---------------------------------------------------------------------------
// Static previews
// ---------------------------------------------------------------------------

const renderToolDetailView = (root: HTMLElement): void => {
	root.innerHTML = renderToolDetailHtml(mockToolDetail);
};

const renderMetricsView = (root: HTMLElement): void => {
	root.innerHTML = renderMetricsHtml(mockMetrics);
};

// ---------------------------------------------------------------------------
// View registry + active-view bookkeeping
// ---------------------------------------------------------------------------

interface IWebviewSpec {
	readonly id: ViewId;
	readonly label: string;
	render: (...args: any[]) => any;
}

const WEBVIEWS: ReadonlyArray<IWebviewSpec> = [
	{ id: 'dashboard', label: 'dashboard', render: renderDashboardView },
	{ id: 'settings', label: 'settings', render: renderSettingsView },
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

const render = async (id: string): Promise<void> => {
	const view = WEBVIEWS.find((v) => v.id === id) ?? WEBVIEWS[0];
	if (!view) {
		root.innerHTML = '<p>No webviews registered.</p>';
		return;
	}
	setActiveView(view.id);
	try {
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
			`<button type="button" data-webview="${escapeHtml(v.id)}">${escapeHtml(v.label)}</button>`,
	).join('');
	for (const btn of sidebar.querySelectorAll<HTMLElement>('[data-webview]')) {
		btn.addEventListener('click', () => {
			const id = btn.dataset.webview;
			if (id) void render(id);
		});
	}
}

// First paint: apply persisted theme on <html> before any view
// renders so the dashboard CSS sees the right data-theme.
bootstrapPersistedPrefs();

// Decide the default landing view based on setup status. A user
// landing on an unwired workspace gets the welcome screen, not a
// half-rendered dashboard with a banner shouting at them. Wrapped
// in an async IIFE because the bundle is treated as a script, not
// a module, by some targets (and `tsc --noEmit` is happy either way
// but `Bun.build` is strict about top-level await when
// `format: 'esm'` is paired with `target: 'browser'`).
void (async (): Promise<void> => {
	const initialStatus = await fetchJson<ISetupStatus>('/api/setup/status');
	const defaultView: ViewId =
		initialStatus?.kind === 'configured' ? 'dashboard' : 'dashboard';
	void render(defaultView).catch((err) => {
		console.error('[dev:vscode] initial render failed', err);
	});
})();

// Expose for ad-hoc devtools inspection.
declare global {
	interface Window {
		__mvDev?: {
			render: (id: string) => Promise<void>;
			getActiveView: () => ViewId;
		};
	}
}
window.__mvDev = { render, getActiveView };

// `dictsByLang` is read by `getDict()`; the named import prevents
// tree-shaking from removing the i18n dicts from the bundle.
export const __keepDictsByLangRef = dictsByLang;
