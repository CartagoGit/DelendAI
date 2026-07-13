/// <reference lib="dom" />
/**
 * `packages/ui-extension` dev entry — renders the dashboard with
 * mock data in a regular browser. Loaded by
 * `tools/scripts/dev/dev.script.ts` at
 * `http://localhost:5100/__entry.js`.
 *
 * What this gives you:
 *  - A full preview of `renderDashboard(model, options)` without
 *    launching VS Code or the MCP server.
 *  - All workspace imports (`@mcp-vertex/ui-extension`, `@mcp-vertex/client`)
 *    resolved by Bun's bundler from the monorepo's workspace symlinks.
 *
 * What this does NOT give you (by design):
 *  - The host-adapter wiring (vscode.TreeDataProvider etc.) — the dev
 *    entry only exercises the **renderer** layer. Click handlers in the
 *    embedded CLIENT_SCRIPT that try to postMessage back to a webview
 *    will be no-ops; that's expected.
 *  - A faithful "Refresh" — the mock data is fixed. Edit
 *    `./mock-model.ts` to see different layouts.
 *
 * The mock model is intentionally minimal: every field the renderers
 * touch gets a value, but optional branches are mostly stubbed. If a
 * panel crashes on render, the wrapper below shows the error in a
 * visible box rather than swallowing it — easier to iterate.
 *
 * The `/// <reference lib="dom" />` directive above is required because
 * the rest of `packages/ui-extension` compiles against the default
 * `lib: ["ES2022"]` (no DOM). Adding the lib globally would force
 * every other module to tolerate DOM types; scoping it to this dev-only
 * file is the minimum-blast-radius fix.
 */
import { renderDashboard } from '@mcp-vertex/ui-extension/public';
import { dictsByLang } from '@mcp-vertex/shared/i18n';
import type { Lang } from '@mcp-vertex/shared/i18n';

import { mockDashboardModel } from './mock-model';

const root = document.getElementById('root');
if (!root) {
	throw new Error('dev entry: #root element missing in landing page');
}

/**
 * `renderDashboard` returns a COMPLETE `<html>` document — the two
 * `<style>` blocks that carry `componentCss` + `dashboardCss` live in
 * its `<head>`. The dev landing page already owns the outer document,
 * so we cannot drop the whole string into `#root`; the previous version
 * extracted ONLY `<body>` and threw the `<head>` away, which is why the
 * dashboard rendered completely unstyled in dev mode. We now hoist every
 * `<style>` block from the rendered `<head>` into the live document head
 * (once) and inject the body markup into `#root`.
 */
const hoistStyles = (renderedHtml: string): void => {
	const headMatch = renderedHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
	const head = headMatch?.[1] ?? '';
	const styleBlocks = head.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? [];
	// Idempotent: the language switcher re-renders, so clear the styles we
	// previously hoisted before adding the fresh set.
	for (const stale of Array.from(
		document.head.querySelectorAll('style[data-dev-hoisted]'),
	)) {
		stale.remove();
	}
	for (const block of styleBlocks) {
		const inner = block
			.replace(/^<style[^>]*>/i, '')
			.replace(/<\/style>$/i, '');
		const el = document.createElement('style');
		el.setAttribute('data-dev-hoisted', '');
		el.textContent = inner;
		document.head.appendChild(el);
	}
};

/**
 * Resolve the preview language from `?lang=xx` (falling back to `en`),
 * so translations are demonstrably applied and switchable in dev — the
 * dashboard copy is driven by `options.lang`, and hard-coding `en`
 * previously made it look like i18n "wasn't working".
 */
const resolveLang = (): Lang => {
	const raw = new URLSearchParams(window.location.search).get('lang');
	return raw !== null && raw in dictsByLang ? (raw as Lang) : 'en';
};

const renderInto = (lang: Lang): void => {
	const html = renderDashboard(mockDashboardModel, {
		docsUrl: 'https://cartagogit.github.io/mcp-vertex/',
		refreshCommand: 'mcp-vertex.refresh',
		openDocsCommand: 'mcp-vertex.openDocs',
		lang: dictsByLang[lang],
	});
	hoistStyles(html);
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	root!.innerHTML = bodyMatch?.[1] ?? html;
};

try {
	renderInto(resolveLang());
} catch (err) {
	const message =
		err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
	root.innerHTML = `<pre id="error">${message}</pre>`;
	console.error('[dev:ide] renderDashboard failed', err);
}
