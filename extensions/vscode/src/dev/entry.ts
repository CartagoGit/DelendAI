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
import type { IDashboardAllModels } from '@mcp-vertex/client';
import type { Lang } from '@mcp-vertex/shared/i18n';
import { dictsByLang } from '@mcp-vertex/shared/i18n';

import {
	bootstrapPersistedPrefs,
	readPersistedPrefs,
	type ISetupStatus,
} from './settings-panel';
import { PageRegistry } from './pages/registry';
import { getActiveView, setActiveView, type ViewId } from './state';

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

interface IInstallResult {
	readonly ok: boolean;
	readonly note: string;
}

// ---------------------------------------------------------------------------
// Page registry + active-view bookkeeping
interface IWebviewSpec {
	readonly id: ViewId;
	readonly label: string;
}

const WEBVIEWS: ReadonlyArray<IWebviewSpec> = [
	{ id: 'dashboard', label: 'dashboard' },
	{ id: 'settings', label: 'settings' },
	{ id: 'tool-detail', label: 'tool-detail' },
	{ id: 'metrics', label: 'metrics' },
];

const root = document.getElementById('root');
if (!root) {
	throw new Error('dev entry: #root element missing in landing page');
}

// Page registry. The `navigate` callback is the same closure for
// every page; it lets a page trigger a route change without
// importing `entry.ts` (the page modules are loaded dynamically).
const pages = new PageRegistry({
	navigate: (id) => render(id),
});

/**
 * Fade the root out before the new page mounts, then fade it
 * back in. Two phases so the swap reads as a real transition
 * instead of a flash:
 *
 *   t=0    — set `data-fade='out'` → root opacity: 0
 *   t=140  — drop the attr (CSS transition releases)
 *   t=140  — orchestrator mounts the new page
 *   t=140  — set `data-fade='in'` → root opacity: 1
 *
 * Cheap (no jank, no JS animation loop) and respects
 * `prefers-reduced-motion` via the matching CSS rule
 * (transition is set to `none`).
 */
const FADE_MS = 140;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;
const crossFade = (next: ViewId): Promise<void> => {
	const previous = getActiveView();
	if (previous === next) return Promise.resolve();
	if (fadeTimer) clearTimeout(fadeTimer);
	root.setAttribute('data-fade', 'out');
	return new Promise((resolve) => {
		fadeTimer = setTimeout(() => {
			root.removeAttribute('data-fade');
			// The orchestrator now mounts the new page; we
			// immediately fade back in by re-setting the attr
			// and clearing it on the next frame so the CSS
			// transition fires.
			requestAnimationFrame(() => {
				root.setAttribute('data-fade', 'in');
				fadeTimer = setTimeout(() => {
					root.removeAttribute('data-fade');
				}, FADE_MS);
				resolve();
			});
		}, FADE_MS);
	});
};

const render = async (id: string): Promise<void> => {
	const viewId = WEBVIEWS.find((v) => v.id === id)
		? (id as ViewId)
		: 'dashboard';
	setActiveView(viewId);
	// Cross-fade out before mounting the new page; the
	// function resolves once the new page is ready to be
	// shown (just before the fade-in starts).
	await crossFade(viewId);
	try {
		const page = await pages.resolve(viewId);
		const status = await fetchJson<ISetupStatus>('/api/setup/status');
		const prefs = readPersistedPrefs();
		await page.render(root, { status, lang: prefs.lang });
	} catch (err) {
		const message =
			err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
		root.innerHTML = `<pre id="error">${escapeHtml(message)}</pre>`;
		console.error(`[dev:vscode] ${viewId} render failed`, err);
	}
	for (const btn of document.querySelectorAll<HTMLElement>(
		'[data-webview]',
	)) {
		btn.dataset.active = btn.dataset.webview === viewId ? 'true' : 'false';
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
