import { dictsByLang } from '@mcp-vertex/shared/i18n';

import {
	bootstrapPersistedPrefs,
	readPersistedPrefs,
	type ISetupStatus,
} from './settings-panel';
import { PageRegistry } from './pages/registry';
import { createLatestTaskQueue } from './render-queue';
import {
	getActiveView,
	isViewId,
	knownViewIds,
	setActiveView,
	type ViewId,
} from './state';

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

let mountedPage: Awaited<ReturnType<PageRegistry['resolve']>> | undefined;

const renderNow = async (id: string): Promise<void> => {
	// `isViewId` is the type guard exported from `state.ts`. An
	// unknown id (e.g. a stale bookmark) falls back to the
	// configured/dashboard view instead of crashing.
	const viewId: ViewId = isViewId(id) ? id : 'dashboard';
	// Cross-fade out before mounting the new page; the
	// function resolves once the new page is ready to be
	// shown (just before the fade-in starts).
	await crossFade(viewId);
	mountedPage?.dispose?.();
	mountedPage = undefined;
	setActiveView(viewId);
	try {
		const page = await pages.resolve(viewId);
		const status = await fetchJson<ISetupStatus>('/api/setup/status');
		const prefs = readPersistedPrefs();
		await page.render(root, { status, lang: prefs.lang });
		mountedPage = page;
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

// The dashboard performs real MCP I/O and can still be resolving when the
// user selects another page. Serialize paints and retain only the latest
// pending destination so a late dashboard response cannot overwrite the
// selected Configuration Center (and rapid clicks do not create a queue).
const render = createLatestTaskQueue<string>(renderNow);

const sidebar = document.getElementById('sidebar');
if (sidebar) {
	sidebar.innerHTML = knownViewIds()
		.map(
			(id) =>
				`<button type="button" data-webview="${escapeHtml(id)}">${escapeHtml(id)}</button>`,
		)
		.join('');
	for (const btn of sidebar.querySelectorAll<HTMLElement>('[data-webview]')) {
		btn.addEventListener('click', () => {
			const id = btn.dataset.webview;
			if (id) void render(id);
		});
	}
}

bootstrapPersistedPrefs();

// `mcpv:dev:lang-changed` is dispatched from `pages/settings.ts`
// when the user picks a new language. Every page bakes the dict
// into its render call, so re-render whatever view is active —
// x00100 S2 acceptance: "changing the language selector re-renders
// every section in that language" (the previous version only
// refreshed the dashboard, leaving configuration/tool-detail/
// metrics in the old language). Re-rendering the settings page
// itself is an idempotent repaint of the same content.
window.addEventListener('mcpv:dev:lang-changed', () => {
	void render(getActiveView());
});

// Decide the default landing view. We always land on
// `dashboard` — the dashboard page itself inspects the setup
// status and swaps in the welcome screen when the workspace
// is unconfigured, so the orchestrator does not need to
// duplicate that decision. A `settings` first paint would
// skip the dashboard chrome entirely, which is the wrong
// experience for a first-time visitor. The Settings tab is
// always reachable from the sidebar.
void (async (): Promise<void> => {
	// Fire-and-forget; the user's first paint does not need
	// to wait on the status fetch — the dashboard page
	// re-fetches on mount. We still await the status here so
	// the `__mcpvDev` global reflects the configured state by
	// the time the user opens devtools.
	const initialStatus = await fetchJson<ISetupStatus>('/api/setup/status');
	window.__mcpvDev = {
		render,
		getActiveView,
		getInitialStatus: () => initialStatus,
	};
	void render('dashboard').catch((err) => {
		console.error('[dev:vscode] initial render failed', err);
	});
})();

// Expose for ad-hoc devtools inspection.
declare global {
	interface Window {
		__mcpvDev?: {
			render: (id: string) => Promise<void>;
			getActiveView: () => ViewId;
			getInitialStatus: () => ISetupStatus | null;
		};
	}
}

// `dictsByLang` is read by `getDict()`; the named import prevents
// tree-shaking from removing the i18n dicts from the bundle.
export const __keepDictsByLangRef = dictsByLang;
