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

const buildEntry = async (entryAbs: string): Promise<Response> => {
	if (!existsSync(entryAbs)) {
		return new Response(
			`Dev entry not found: ${entryAbs}\n` +
				`Create it (see packages/ui-extension/src/dev/entry.ts for a template).`,
			{ status: 500 },
		);
	}
	const result = await Bun.build({
		entrypoints: [entryAbs],
		target: 'browser',
		format: 'esm',
		minify: false,
		sourcemap: 'inline',
		// Don't try to bundle Node-only or VS Code APIs in the browser bundle.
		external: ['node:*', 'vscode'],
	});
	if (!result.success) {
		const messages = result.logs
			.map((l) => `[${l.level}] ${l.message}`)
			.join('\n');
		return new Response(`Build failed:\n${messages}`, { status: 500 });
	}
	const out = result.outputs[0];
	if (!out) return new Response('Build produced no output', { status: 500 });
	return new Response(await out.text(), {
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
	const gridCss = target.sidebar
		? `#app { display: grid; grid-template-columns: 220px 1fr; gap: 1.5rem; align-items: start; }`
		: '';
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${target.title ?? `mcp-vertex ${target.name}`}</title>
	<style>
		:root { color-scheme: light dark; }
		body { font: 14px/1.5 system-ui, -apple-system, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
		header { border-bottom: 1px solid #8884; padding-bottom: 1rem; margin-bottom: 1.5rem; }
		h1 { margin: 0 0 .25rem; font-size: 1.4rem; }
		.meta { color: #888; font-size: .9rem; }
		${gridCss}
		#sidebar { display: flex; flex-direction: column; gap: .5rem; position: sticky; top: 1rem; }
		#sidebar button { padding: .5rem .75rem; border: 1px solid #8884; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; text-align: left; font: inherit; }
		#sidebar button[data-active="true"] { background: #8882; border-color: #8888; }
		#root { min-width: 0; }
		#root > section, #root > div, #root > article { margin-bottom: 1.5rem; padding: 1rem; border: 1px solid #8884; border-radius: 8px; }
		pre { background: #8882; padding: .5rem; border-radius: 4px; overflow: auto; }
		#error { color: #c33; border-color: #c334; }
	</style>
</head>
<body>
	<header>
		<h1>${target.title ?? `mcp-vertex ${target.name}`}</h1>
		<div class="meta">${target.url} · dev entry: <code>${entryRel}</code></div>
		<p>${target.blurb ?? ''}</p>
	</header>
	<div id="app">${layout}</div>
	<script type="module" src="/__entry.js"></script>
</body>
</html>
`;
};

// ---------------------------------------------------------------------------
// Per-target dev server
// ---------------------------------------------------------------------------

const startDevEntry = (target: ITarget): void => {
	if (!target.entry) {
		throw new Error(`dev-entry target missing entry: ${target.name}`);
	}
	const entryAbs = join(target.root, target.entry);
	const entryRel = relative(target.root, entryAbs);

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

const startAstro = (target: ITarget): Subprocess => {
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
	for (const target of targets) {
		if (target.kind === 'dev-entry') startDevEntry(target);
		else children.push(startAstro(target));
	}
	console.log(
		`[dev] up: ${targets.map((t) => `${t.name}=${t.url}`).join('  ')}`,
	);
	const astroChild = children[0];
	if (astroChild) {
		astroChild.exited.then((code) => stop(code ?? 0));
	} else {
		process.stdin.resume();
	}
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
