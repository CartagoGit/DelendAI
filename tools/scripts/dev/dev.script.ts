#!/usr/bin/env bun
/**
 * Dev orchestrator — starts three dev servers in parallel:
 *
 *   apps/web            → http://localhost:5000  (Astro, owns its own port via astro.config.mjs)
 *   packages/ui-extension → http://localhost:5100  (dev entry: renders the dashboard with mock data)
 *   extensions/vscode   → http://localhost:5200  (dev entry: renders the extension's webviews with mock data)
 *
 * Why a single entrypoint? `packages/ui-extension` and `extensions/vscode`
 * are not standalone web apps — they're components embedded in host IDEs
 * (webviews) or served as a VS Code extension. They have no production
 * server. For local previews we render their UI in a regular browser
 * using a tiny `dev/entry.ts` per package that calls the real renderer
 * functions with mock data, served by `Bun.serve` + `Bun.build` to
 * transform the TS.
 *
 * Zero new dependencies: Bun is the only runtime we need. Workspace
 * imports (`@mcp-vertex/*`) are resolved by Bun's built-in resolver
 * using the package's own `tsconfig.json#paths` + `node_modules`
 * symlinks created by `bun install` workspaces.
 *
 * Usage:
 *   bun run dev               # all three in parallel
 *   bun run dev:web           # Astro only (5000)
 *   bun run dev:ide           # ide dev entry only (5100)
 *   bun run dev:vscode        # vscode dev entry only (5200)
 */
import { spawn, type Subprocess } from 'bun';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Port reclaim — `Bun.serve({ port })` and `astro dev` both fail with
// EADDRINUSE when a stale instance (a previous run, an aborted
// `nohup`, a `bun run dev:vscode` left running in another terminal)
// is still bound. Before claiming the port we read `/proc/net/tcp`
// via `ss` and `SIGTERM` any PID we find listening on it. If the PID
// doesn't exit within `PORT_RECLAIM_TIMEOUT_MS`, escalate to
// `SIGKILL`. The whole dance is best-effort: if `ss` is missing or
// returns nothing, the bind just proceeds and either succeeds (port
// was free) or fails with EADDRINUSE (the user sees the usual error).
//
// We deliberately do NOT touch MCP host-server processes — those
// listen on stdio (not TCP), so they cannot collide with dev ports.
// And we don't kill arbitrary `bun` procs (only the specific PIDs
// reported by `ss` as bound to our port) so a developer's unrelated
// `bun run foo` survives.
// ---------------------------------------------------------------------------

const PORT_RECLAIM_TIMEOUT_MS = 1500;

const readPortPids = async (port: number): Promise<readonly number[]> => {
	// `ss -tlnp` outputs lines like
	//   LISTEN 0  511  0.0.0.0:5200  0.0.0.0:*  users:(("bun",pid=148710,fd=19))
	// We grep by `:PORT ` (note the trailing space — `5000` should not
	// match `:50000`) and pull every `pid=N` out of the line. If
	// there's no match (port already free) we return [].
	const proc = spawn({
		cmd: [
			'bash',
			'-c',
			`ss -tlnp 2>/dev/null | grep -F ':${port} ' || true`,
		],
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'ignore',
	});
	const text = proc.stdout
		? await new Response(proc.stdout as ReadableStream<Uint8Array>).text()
		: '';
	const pids = new Set<number>();
	for (const match of text.matchAll(/pid=(\d+)/g)) {
		const pid = Number(match[1]);
		if (Number.isFinite(pid) && pid > 0) pids.add(pid);
	}
	return [...pids];
};

const isAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const waitForExit = async (
	pid: number,
	timeoutMs: number,
): Promise<boolean> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isAlive(pid)) return true;
		await new Promise((r) => setTimeout(r, 50));
	}
	return !isAlive(pid);
};

/**
 * Kill any process currently bound to `port`. Safe to call when the
 * port is already free (no-op). Logs the killed PID so a developer
 * who runs `bun run dev` from a fresh terminal can see that the
 * previous instance was cleaned up. Used by both `Bun.serve` (the
 * dev-entry path) and `spawn` (the Astro path).
 */
const freePort = async (port: number, label: string): Promise<void> => {
	const pids = await readPortPids(port);
	if (pids.length === 0) return;
	console.log(
		`[dev:${label}] port ${port} busy (pids: ${pids.join(', ')}) — reclaiming`,
	);
	for (const pid of pids) {
		try {
			process.kill(pid, 'SIGTERM');
		} catch {
			// already gone between ss and kill — fine
		}
	}
	// Give them a moment, then escalate any survivors.
	await new Promise((r) => setTimeout(r, 100));
	const survivors = pids.filter(isAlive);
	for (const pid of survivors) {
		try {
			process.kill(pid, 'SIGKILL');
			console.log(
				`[dev:${label}] SIGKILL pid=${pid} (did not exit on SIGTERM)`,
			);
		} catch {
			// gone now
		}
	}
	const allGone = await Promise.all(
		pids.map((pid) => waitForExit(pid, PORT_RECLAIM_TIMEOUT_MS)),
	);
	if (allGone.every(Boolean)) {
		console.log(`[dev:${label}] port ${port} reclaimed`);
	} else {
		console.warn(
			`[dev:${label}] port ${port} still busy after SIGKILL — bind will likely fail`,
		);
	}
};

const HERE = dirname(fileURLToPath(import.meta.url));
// tools/scripts/dev/ → repo root
const ROOT = resolve(HERE, '..', '..', '..');

const WEB_PORT = 5000;
const IDE_PORT = 5100;
const VSCODE_PORT = 5200;

type Kind = 'astro' | 'dev-entry';
type TargetName = 'web' | 'ide' | 'vscode';

interface ITarget {
	readonly name: TargetName;
	readonly port: number;
	readonly root: string;
	readonly kind: Kind;
	readonly url: string;
	/** For `dev-entry`, the entry script rendered into the dev HTML. */
	readonly entry?: string;
	/** Title for the dev landing page. */
	readonly title?: string;
	/** Short description shown on the landing page. */
	readonly blurb?: string;
	/** Whether the dev page should reserve a sidebar for a chooser. */
	readonly sidebar?: boolean;
}

const TARGETS: readonly ITarget[] = [
	{
		name: 'web',
		port: WEB_PORT,
		root: join(ROOT, 'apps/web'),
		kind: 'astro',
		url: `http://localhost:${WEB_PORT}`,
	},
	{
		name: 'ide',
		port: IDE_PORT,
		root: join(ROOT, 'packages/ui-extension'),
		kind: 'dev-entry',
		entry: 'src/dev/entry.ts',
		url: `http://localhost:${IDE_PORT}`,
		title: 'packages/ui-extension — dashboard preview',
		blurb:
			'Previsualiza el dashboard de la extensión con mock data. ' +
			'En la extensión real, este HTML se inyecta dentro de un webview de VS Code.',
		sidebar: false,
	},
	{
		name: 'vscode',
		port: VSCODE_PORT,
		root: join(ROOT, 'extensions/vscode'),
		kind: 'dev-entry',
		entry: 'src/dev/entry.ts',
		url: `http://localhost:${VSCODE_PORT}`,
		title: 'extensions/vscode — webviews preview',
		blurb:
			'Previsualiza los webviews de la extensión (tool-detail, metrics) con mock data. ' +
			'En la extensión real, VS Code llama a renderToolDetailHtml(model) y monta el string en un webview panel.',
		sidebar: true,
	},
];

// ---------------------------------------------------------------------------
// Bun build: transform TS on-the-fly, resolve @mcp-vertex/* via workspace
// symlinks + tsconfig paths (both understood by Bun's resolver).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SCSS plugin — turns `import css from './foo.scss'` (and
// `./foo.scss?raw`) into a string module emitting the *compiled* CSS.
// Uses the same `sass` package that `apps/web` uses for the Astro
// site, so the dev preview and the production webview pull from the
// same `.scss` files and end up with identical CSS.
//
// Plugin responsibilities:
//   - Resolve `./foo.scss` and `./foo.scss?raw` to a real file path.
//   - Load the file source.
//   - Compile with `sass.compileString` and emit a string module so
//     consumers can `import css from './foo.scss'` (no `sass` import
//     in the browser bundle — that would pull in ~19MB of compiler).
//
// The companion ambient module declarations in
// `apps/shared/src/styles/raw.d.ts` give TypeScript the string type
// so editor IntelliSense works without pulling `sass` types.
// ---------------------------------------------------------------------------
import { compileString as sassCompile } from 'sass';
import { pathToFileURL } from 'node:url';

const scssPlugin = {
	name: 'mcp-vertex-scss',
	async setup(build: import('bun').Build): Promise<void> {
		build.onResolve({ filter: /\.scss(\?raw)?$/ }, (args) => {
			const cleanPath = args.path.split('?')[0] ?? '';
			const abs = cleanPath.startsWith('/')
				? cleanPath
				: `${args.resolveDir}/${cleanPath}`;
			return { path: abs, namespace: 'mcp-scss' };
		});
		build.onLoad(
			{ filter: /\.scss(\?raw)?$/, namespace: 'mcp-scss' },
			async (args) => {
				const path = args.path.split('?')[0] ?? args.path;
				const file = Bun.file(path);
				const source = await file.text();
				let compiled: string;
				try {
					// `sass.compileString` resolves `@use './tokens'` style
					// imports relative to the `url` we pass. Without a
					// file:// URL, sass falls back to the CWD and the
					// `@use` resolver can't find siblings in
					// `apps/shared/src/styles/_*.scss`.
					compiled = sassCompile(source, {
						url: pathToFileURL(path).href,
						loadPaths: [dirname(path)],
					}).css;
				} catch (err) {
					const msg =
						err instanceof Error ? err.message : String(err);
					return {
						contents: `throw new Error(${JSON.stringify(`SCSS compile failed in ${path}: ${msg}`)});`,
						loader: 'js',
					};
				}
				return {
					// Emit BOTH a default and a named export so
					// consumers can use either:
					//   import css from './foo.scss';
					//   import { compiledCss } from './foo.scss';
					// The named export is what `apps/shared`'s
					// `*-css.ts` wrappers and the SCSS-aware
					// consumers use; the default export is what
					// Bun's built-in `.scss?raw` style imports
					// would expect. With both, every shape
					// resolves, and the chunk merger keeps a
					// single binding per module.
					contents: `const compiledCss = ${JSON.stringify(compiled)};\nexport { compiledCss };\nexport default compiledCss;`,
					loader: 'js',
				};
			},
		);
	},
};

/**
 * In-memory bundle + chunk cache. The dev server's first build
 * resolves all dynamic imports (the lazy pages, the SCSS
 * composition, etc.) into per-chunk outputs and indexes them
 * by basename. The route handler then serves `/__entry.js`
 * and `/<chunk>.js` from this map.
 *
 * Why a Map (and not a single Response that re-bundles per
 * request)?
 *   - A fresh Bun.build per request would defeat the
 *     purpose of `splitting: true` — the entry's lazy
 *     `import('./chunk-…')` only fetches the chunk from
 *     the browser, but if the build is re-run on every
 *     request the entry is a megabyte again because the
 *     dev server has to "re-discover" the chunk graph.
 *   - With `write: false` we get the built outputs as Blob
 *     in memory, no temp dir to clean up. Caching the
 *     outputs lets the dev server serve them with a
 *     single Map lookup.
 *   - The first cold load pays the build cost (~150ms).
 *     Subsequent reloads during the same dev session
 *     hit the cache. A future slice adds a "force
 *     rebuild on file change" watch — for now the cache
 *     is invalidated only on server restart.
 */
type BundleMap = ReadonlyMap<string, string>;
let bundleCache: BundleMap | null = null;

const buildBundle = async (entryAbs: string): Promise<BundleMap> => {
	if (!existsSync(entryAbs)) {
		throw new Error(
			`Dev entry not found: ${entryAbs}\n` +
				`Create it (see packages/ui-extension/src/dev/entry.ts for a template).`,
		);
	}
	const result = await Bun.build({
		entrypoints: [entryAbs],
		target: 'browser',
		format: 'esm',
		minify: false,
		sourcemap: 'inline',
		plugins: [scssPlugin],
		// Don't try to bundle Node-only or VS Code APIs in the browser bundle.
		external: ['node:*', 'vscode'],
		// Code-split the dynamic `import('./<page>')` calls in
		// pages/registry.ts so each page becomes its own
		// chunk. Without this Bun.build inlines the page
		// modules into the entry, defeating the lazy load.
		splitting: true,
		// `write: false` keeps the bundle in memory — we
		// serve the chunks via a Map lookup in the route
		// handler, no tmp dir to clean up.
		write: false,
	});
	if (!result.success) {
		const messages = result.logs
			.map((l) => `[${l.level}] ${l.message}`)
			.join('\n');
		throw new Error(`Build failed:\n${messages}`);
	}
	const out = new Map<string, string>();
	for (const output of result.outputs) {
		// `output.path` is something like './entry.js' or
		// './chunk-7d4f.js' (or a CSS asset path). We index
		// by basename so the route handler can match
		// `/<basename>` directly.
		const basename = output.path.split('/').pop() ?? output.path;
		let content = await output.text();
		// Bun.build minifier emits side-effect imports as
		// `import"./chunk-X.js";` (no space) which is a
		// parse error in strict-mode browsers. Normalise to
		// `import "..."` with the canonical space. Only the
		// entry's top-level imports are at risk — chunk
		// imports use `import("./…")` which is unaffected.
		if (basename === 'entry.js') {
			content = content.replace(/^import"([^"]+)";/gm, 'import "$1";');
		}
		// Bun.build with `splitting: true` sometimes emits
		// **multiple** `export { foo, bar, ... };` blocks in
		// the same chunk when several source modules re-export
		// overlapping symbol sets (e.g. the `webview/index.ts`
		// barrel AND `csp.ts` both live in the same chunk
		// because of shared downstream consumers). The browser
		// refuses to parse the result: `SyntaxError: Duplicate
		// export of '<symbol>'`. The fix is to consolidate all
		// top-level `export { … };` blocks into ONE block whose
		// symbol set is the union of the originals. Identity,
		// not union, is what we want: a symbol that appears in
		// two blocks is the same declaration and only needs one
		// entry in the merged block.
		content = consolidateExports(content);
		out.set(basename, content);
	}
	return out;
};

/**
 * Merge every top-level `export { … };` block in `content` into
 * a single block whose symbol list is the de-duplicated union
 * of all originals.
 *
 * Only top-level export blocks are touched; named re-exports
 * (`export { foo } from './bar.js'`) and any other export forms
 * are left alone. The function is a dev-time transform — its
 * only job is to scrub Bun.build output so browsers will accept
 * the chunk.
 */
const consolidateExports = (content: string): string => {
	const exportBlock = /^export\s*\{([\s\S]*?)\};/gm;
	const matches = [...content.matchAll(exportBlock)];
	if (matches.length === 0) return content;
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const m of matches) {
		const symbols = m[1]
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s !== '');
		for (const sym of symbols) {
			if (!seen.has(sym)) {
				seen.add(sym);
				merged.push(sym);
			}
		}
	}
	if (merged.length === 0) return content;
	const block = `export {\n  ${merged.join(',\n  ')},\n};`;
	return `${content.replace(exportBlock, '').trimEnd()}\n\n${block}\n`;
};

const buildEntry = async (entryAbs: string): Promise<Response> => {
	try {
		if (!bundleCache) bundleCache = await buildBundle(entryAbs);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(message, { status: 500 });
	}
	const entry = bundleCache.get('entry.js');
	if (!entry) {
		return new Response('Build produced no entry', { status: 500 });
	}
	return new Response(entry, {
		headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
	});
};

/**
 * Serve a chunk by basename. The dev server's route handler
 * calls this for any `/<chunk>.js` request that the entry
 * `import()`s. The browser's relative-path resolution means
 * an entry at `/__entry.js` with `import('./chunk-X.js')`
 * will fetch `/chunk-X.js`, which is exactly the URL this
 * helper handles.
 */
const buildChunk = async (basename: string): Promise<Response> => {
	if (!bundleCache) {
		return new Response('Bundle not built yet', { status: 503 });
	}
	const chunk = bundleCache.get(basename);
	if (!chunk) {
		return new Response('Chunk not found', { status: 404 });
	}
	return new Response(chunk, {
		headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
	});
};

// ---------------------------------------------------------------------------
// Dev entry HTML — the landing page the user sees at `/`.
// ---------------------------------------------------------------------------

const renderDevHtml = (target: ITarget, entryRel: string): string => {
	const layout = target.sidebar
		? `<aside id="sidebar" aria-label="Webviews"></aside><main id="root">Cargando renderers…</main>`
		: `<main id="root">Cargando renderers…</main>`;
	// The shell mirrors the real VS Code webview surface: full-bleed,
	// no max-width, sidebar on the left at ≥800px that scrolls to a
	// top tab strip below that. Theme follows `--vscode-*` tokens
	// when the page is opened inside an embedded webview (rare for
	// the dev entry, but cheap to support) and falls back to a
	// GitHub-dark palette for the standalone browser preview.
	const shellCss = `
		:root {
			color-scheme: light dark;
			/* Bridge the marketing site's theme vars (--bg/--fg/--card/--line/--
accent, declared on :root[data-theme=...]) into the dev preview's --mv-* to
kens, so the theme picker actually repaints the chrome. The non-theme
fallbacks below keep the standalone-vscode preview legible when no
data-theme attr is set (the picker default 'system' removes it). */
			--mv-bg: var(--bg, var(--vscode-editor-background, #1e1e1e));
			--mv-bg-soft: var(--bg-soft, var(--vscode-sideBar-background, #252526));
			--mv-bg-card: var(--card, var(--vscode-editorWidget-background, #252526));
			--mv-fg: var(--fg, var(--vscode-foreground, #d4d4d4));
			--mv-fg-muted: var(--muted, var(--vscode-descriptionForeground, #858585));
			--mv-border: var(--line, var(--vscode-widget-border, #3c3c3c));
			--mv-focus: var(--vscode-focusBorder, #007fd4);
			--mv-link: var(--accent, var(--vscode-textLink-foreground, #3794ff));
			--mv-font-prose: var(--vscode-font-family, system-ui, -apple-system, "Segoe WPC", "Segoe UI", sans-serif);
			--mv-font-mono: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
		}
		* { box-sizing: border-box; }
		html, body {
			margin: 0;
			padding: 0;
			background: var(--mv-bg);
			color: var(--mv-fg);
			font-family: var(--mv-font-prose);
			font-size: 13px;
			line-height: 1.5;
			-webkit-font-smoothing: antialiased;
		}
		body { display: flex; flex-direction: column; min-height: 100vh; }
		code, pre {
			font-family: var(--mv-font-mono);
			font-variant-numeric: tabular-nums;
		}
		.dev-header {
			display: flex;
			align-items: center;
			flex-wrap: wrap;
			gap: 8px 12px;
			padding: 10px 16px;
			background: var(--mv-bg-soft);
			border-bottom: 1px solid var(--mv-border);
		}
		.dev-header__title {
			font-weight: 600;
			font-size: 13px;
			letter-spacing: 0.01em;
			margin: 0;
			flex: 1 1 auto;
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.dev-header__meta {
			color: var(--mv-fg-muted);
			font-size: 11px;
			flex: 0 0 auto;
		}
		.dev-header__blurb {
			flex: 1 1 100%;
			color: var(--mv-fg-muted);
			font-size: 12px;
			margin: 0;
			padding-top: 4px;
			border-top: 1px solid var(--mv-border);
			width: 100%;
		}
		.dev-header__blurb:empty { display: none; }
		#app {
			flex: 1 1 auto;
			display: flex;
			flex-direction: column;
			min-height: 0;
		}
		${
			target.sidebar
				? `
		#app { flex-direction: row; }
		#sidebar {
			width: 220px;
			min-width: 220px;
			max-width: 220px;
			flex-shrink: 0;
			background: var(--mv-bg-soft);
			border-right: 1px solid var(--mv-border);
			padding: 12px 8px;
			display: flex;
			flex-direction: column;
			gap: 2px;
			overflow-y: auto;
			max-height: calc(100vh - 60px);
		}
		#sidebar button {
			display: block;
			width: 100%;
			text-align: left;
			padding: 6px 10px;
			border-radius: 3px;
			border: 1px solid transparent;
			background: transparent;
			color: var(--mv-fg-muted);
			cursor: pointer;
			font: inherit;
			line-height: 1.4;
			transition: background 60ms ease, color 60ms ease;
		}
		#sidebar button:hover {
			background: var(--mv-bg-card);
			color: var(--mv-fg);
		}
		#sidebar button[data-active='true'] {
			background: var(--mv-bg-card);
			color: var(--mv-fg);
			border-color: var(--mv-border);
			font-weight: 500;
		}
		#sidebar button:focus-visible {
			outline: 1px solid var(--mv-focus);
			outline-offset: -1px;
		}
		#root {
			flex: 1 1 auto;
			min-width: 0;
			min-height: 0;
			overflow: auto;
		}
		@media (max-width: 800px) {
			#app { flex-direction: column; }
			#sidebar {
				width: 100%;
				min-width: 0;
				max-width: none;
				max-height: none;
				flex-direction: row;
				flex-wrap: wrap;
				border-right: 0;
				border-bottom: 1px solid var(--mv-border);
				padding: 6px;
			}
			#sidebar button {
				width: auto;
				flex: 0 0 auto;
				padding: 4px 10px;
				border-radius: 3px;
			}
		}
		`
				: `
		#root { padding: 0; min-height: 0; }
		`
		}
		#root > section, #root > div, #root > article {
			margin-bottom: 16px;
		}
		pre {
			background: var(--mv-bg-soft);
			padding: 8px 10px;
			border-radius: 3px;
			border: 1px solid var(--mv-border);
			overflow: auto;
			font-size: 12px;
		}
		#error {
			color: var(--mv-error, #f48771);
			border-color: var(--mv-error, #f48771);
		}
		a { color: var(--mv-link); }
		a:focus-visible { outline: 1px solid var(--mv-focus); outline-offset: 1px; }

		/* Cross-fade between page renders. The orchestrator
		 * toggles data-fade='out' to fade the current page out,
		 * mounts the new page, then sets data-fade='in' to
		 * fade it back in. prefers-reduced-motion users get
		 * an instant swap (no opacity animation).
		 */
		#root { transition: opacity 140ms ease-out; opacity: 1; }
		#root[data-fade='out'] { opacity: 0; }
		@media (prefers-reduced-motion: reduce) {
			#root { transition: none; }
		}

		@media (max-width: 600px) {
			.dev-header { padding: 8px 10px; }
			.dev-header__title { font-size: 12px; }
			.dev-header__meta { font-size: 10px; }
		}
	`;
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(target.title ?? `mcp-vertex ${target.name}`)}</title>
	<style>${shellCss}</style>
</head>
<body>
	<header class="dev-header">
		<h1 class="dev-header__title">${escapeHtml(target.title ?? `mcp-vertex ${target.name}`)}</h1>
		<div class="dev-header__meta">${escapeHtml(target.url)} · <code>${escapeHtml(entryRel)}</code></div>
		<p class="dev-header__blurb">${target.blurb ?? ''}</p>
	</header>
	<div id="app">${layout}</div>
	<script type="module" src="/__entry.js"></script>
</body>
</html>
`;
};

const escapeHtml = (s: string): string =>
	s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

// ---------------------------------------------------------------------------
// /api/* routes — workspace-aware helpers (setup detection,
// auto-install, real-data fetch from the MCP server).
//
// Why server-side? The browser bundle cannot import `node:fs` or
// `cross-spawn` (we proved this is fragile in earlier slices). All
// filesystem reads, writes, and MCP stdio spawns happen here, in Bun
// (Node-like), and the browser hits HTTP. This keeps the browser
// bundle pure and lets the dev preview show REAL data from the
// workspace it's pointed at — not just the shared mock.
// ---------------------------------------------------------------------------

import { detectSetupStatus, type ISetupStatus } from './api/setup-status';
import { runSetupInstall } from './api/setup-install';
import { fetchRealDashboard, type IApiError } from './api/real-data';

const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body, null, 2), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});

const handleApi = async (
	defaultCwd: string,
	req: Request,
	url: URL,
): Promise<Response> => {
	// Allow `?cwd=/abs/path` so a developer can preview how the
	// extension would behave in any project on disk. The default cwd
	// is whatever directory the developer launched `bun run dev:***`
	// from (`process.cwd()` of the dev server), NOT the target's own
	// root — when you fire up the dev server from `/path/to/your-app`
	// the wizard should look at `/path/to/your-app/.vscode/`, not at
	// `extensions/vscode/.vscode/` (which is where the extension
	// package itself lives). The caller passes a `defaultCwd` (the
	// repo root, where the dev server was launched) so it works the
	// same way in CI and locally.
	const cwd = resolveCwd(defaultCwd, url);
	if ('error' in cwd)
		return jsonResponse({ ok: false, message: cwd.error }, 400);

	if (url.pathname === '/api/setup/status') {
		const status: ISetupStatus = detectSetupStatus(cwd.path);
		return jsonResponse(status);
	}
	if (url.pathname === '/api/setup/install' && req.method === 'POST') {
		const result = runSetupInstall(cwd.path);
		return jsonResponse(result);
	}
	if (url.pathname === '/api/dashboard') {
		const result = await fetchRealDashboard(cwd.path);
		if ('ok' in result && result.ok === false) {
			return jsonResponse(result as IApiError, 502);
		}
		return jsonResponse(result);
	}
	return new Response('Not found', { status: 404 });
};

const resolveCwd = (
	fallback: string,
	url: URL,
): { path: string } | { error: string } => {
	const raw = url.searchParams.get('cwd');
	if (!raw) return { path: fallback };
	if (!raw.startsWith('/')) return { error: 'cwd must be absolute' };
	if (raw.includes('..') || raw.includes('\0'))
		return { error: 'cwd contains illegal characters' };
	if (!existsSync(raw)) return { error: `cwd does not exist: ${raw}` };
	return { path: raw };
};

// ---------------------------------------------------------------------------
// Per-target dev server
// ---------------------------------------------------------------------------

const startDevEntry = async (target: ITarget): Promise<void> => {
	if (!target.entry) {
		throw new Error(`dev-entry target missing entry: ${target.name}`);
	}
	const entryAbs = join(target.root, target.entry);
	const entryRel = relative(target.root, entryAbs);

	// Reclaim the port BEFORE Bun.serve binds it, otherwise we'd race
	// the kernel and get EADDRINUSE if an old run is still listening.
	await freePort(target.port, target.name);

	const server = Bun.serve({
		port: target.port,
		hostname: '0.0.0.0',
		development: true,
		async fetch(req): Promise<Response> {
			const url = new URL(req.url);
			if (url.pathname === '/' || url.pathname === '/index.html') {
				return new Response(renderDevHtml(target, entryRel), {
					headers: { 'Content-Type': 'text/html; charset=utf-8' },
				});
			}
			if (url.pathname === '/__entry.js') {
				return buildEntry(entryAbs);
			}
			// Code-split chunks emitted by Bun.build with
			// `splitting: true` and `write: false`. The entry's
			// `import('./chunk-X.js')` resolves relative to
			// `/__entry.js`, so a request for `/<basename>.js`
			// is a chunk lookup. The basename is matched
			// against the cached bundle so we never serve
			// arbitrary workspace files.
			if (
				url.pathname.startsWith('/chunk-') &&
				url.pathname.endsWith('.js')
			) {
				const basename = url.pathname.slice(1);
				return buildChunk(basename);
			}
			if (url.pathname.startsWith('/api/')) {
				return handleApi(process.cwd(), req, url);
			}
			// Co-located assets (CSS, JSON, etc.) the entry may import via
			// a relative path. Anything else is 404.
			const decoded = decodeURIComponent(url.pathname);
			if (decoded.includes('..') || decoded.includes('\0')) {
				return new Response('Bad request', { status: 400 });
			}
			const filePath = join(target.root, decoded);
			if (
				!filePath.startsWith(`${target.root}/`) &&
				filePath !== target.root
			) {
				return new Response('Bad request', { status: 400 });
			}
			if (existsSync(filePath)) return new Response(Bun.file(filePath));
			return new Response('Not found', { status: 404 });
		},
	});
	console.log(`[dev:${target.name}] ${entryRel} → ${target.url}`);
	process.once('exit', () => server.stop(true));
};

const startAstro = async (target: ITarget): Promise<Subprocess> => {
	// Astro's dev server (`bun run dev --host`) does NOT crash with a
	// nice EADDRINUSE message — it hangs trying to bind. Reclaim the
	// port first so the developer never sees that hang.
	await freePort(target.port, target.name);
	const child = spawn({
		cmd: ['bun', 'run', 'dev', '--', '--host'],
		cwd: target.root,
		stdin: 'inherit',
		stdout: 'inherit',
		stderr: 'inherit',
		env: { ...process.env, FORCE_COLOR: '1' },
	});
	console.log(`[dev:${target.name}] astro → ${target.url}`);
	return child;
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const main = (selected: ReadonlySet<TargetName>): void => {
	const targets = TARGETS.filter(
		(t) => selected.size === 0 || selected.has(t.name),
	);
	if (targets.length === 0) {
		console.error(
			`[dev] no targets matched ${[...selected].join(',')}; available: ${TARGETS.map((t) => t.name).join(', ')}`,
		);
		process.exit(2);
	}
	const children: Subprocess[] = [];
	const stop = (code: number): void => {
		for (const child of children) {
			try {
				child.kill();
			} catch {
				// already dead
			}
		}
		process.exit(code);
	};
	process.on('SIGINT', () => stop(130));
	process.on('SIGTERM', () => stop(143));
	// `startDevEntry` / `startAstro` are both async (freePort is
	// async). Start them in parallel; collect Astro children as they
	// resolve so `stop()` has something to SIGKILL on shutdown. Dev-
	// entry paths run in-process (Bun.serve) and stay alive until
	// SIGINT.
	void Promise.all(
		targets.map(async (target) => {
			if (target.kind === 'dev-entry') {
				await startDevEntry(target);
				return;
			}
			const child = await startAstro(target);
			children.push(child);
		}),
	).then(() => {
		console.log(
			`[dev] up: ${targets.map((t) => `${t.name}=${t.url}`).join('  ')}`,
		);
		const astroChild = children[0];
		if (astroChild) {
			astroChild.exited.then((code) => stop(code ?? 0));
		} else {
			process.stdin.resume();
		}
	});
};

const argToTarget = (raw: string): TargetName | null => {
	const trimmed = raw.replace(/^--?/, '').toLowerCase();
	if (trimmed === 'web' || trimmed === 'ide' || trimmed === 'vscode') {
		return trimmed;
	}
	return null;
};

const selected = new Set<TargetName>();
for (const a of process.argv.slice(2)) {
	const t = argToTarget(a);
	if (t) selected.add(t);
	else {
		console.error(`[dev] unknown target '${a}'`);
		process.exit(2);
	}
}

main(selected);
