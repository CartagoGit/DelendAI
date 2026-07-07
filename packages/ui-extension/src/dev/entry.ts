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

import { mockDashboardModel } from './mock-model';

const root = document.getElementById('root');
if (!root) {
	throw new Error('dev entry: #root element missing in landing page');
}

try {
	const html = renderDashboard(mockDashboardModel, {
		docsUrl: 'https://cartagogit.github.io/mcp-vertex/',
		refreshCommand: 'mcp-vertex.refresh',
		openDocsCommand: 'mcp-vertex.openDocs',
		lang: dictsByLang.en,
	});
	// `renderDashboard` returns a complete <html> document; the landing
	// page already has its own <html>/<head>/<body>, so we extract the
	// body's innerHTML and inject only that.
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	root.innerHTML = bodyMatch?.[1] ?? html;
} catch (err) {
	const message =
		err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
	root.innerHTML = `<pre id="error">${message}</pre>`;
	console.error('[dev:ide] renderDashboard failed', err);
}
