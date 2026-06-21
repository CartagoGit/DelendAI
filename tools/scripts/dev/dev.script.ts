#!/usr/bin/env bun
/**
 * Dev orchestrator — starts the three dev servers in parallel:
 *
 *   apps/web     → http://localhost:5000  (Astro, owns its own port via astro.config.mjs)
 *   apps/ide     → http://localhost:5100  (static: serves apps/ide/src via Bun.serve)
 *   apps/vscode  → http://localhost:5200  (static: serves apps/vscode/src via Bun.serve)
 *
 * Why a single entrypoint? The two non-Astro apps don't ship a build pipeline
 * (apps/ide is HTML/CSS/vanilla JS consumed by host webviews; apps/vscode is
 * an extension that runs inside VS Code, not a server). They only need a
 * static file server for local previews, so we lift `Bun.serve` here
 * instead of adding a Vite-style HMR toolchain for a few static files.
 *
 * Usage:
 *   bun run dev               # all three in parallel
 *   bun run dev:web           # Astro only (5000)
 *   bun run dev:ide           # static ide only (5100)
 *   bun run dev:vscode        # static vscode only (5200)
 *
 * Mapped to package.json `scripts.dev:*` entries; the file is colocated
 * under tools/scripts/dev/ to match the existing script split
 * (see scripts/host/host-server.script.ts).
 */
import { spawn, type Subprocess } from 'bun';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// tools/scripts/dev/ → repo root
const ROOT = resolve(HERE, '..', '..', '..');

const WEB_PORT = 5000;
const IDE_PORT = 5100;
const VSCODE_PORT = 5200;

interface ITarget {
	readonly name: string;
	readonly port: number;
	readonly root: string;
	readonly kind: 'astro' | 'static';
	/** Only meaningful for `static` targets: the path inside the repo to serve. */
	readonly serveFrom?: string;
	/** Banner shown right after the server is up. */
	readonly url: string;
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
		root: join(ROOT, 'apps/ide'),
		kind: 'static',
		serveFrom: 'src',
		url: `http://localhost:${IDE_PORT}`,
	},
	{
		name: 'vscode',
		port: VSCODE_PORT,
		root: join(ROOT, 'apps/vscode'),
		kind: 'static',
		serveFrom: 'src',
		url: `http://localhost:${VSCODE_PORT}`,
	},
];

/**
 * Map a request URL to a file on disk for the static servers.
 * Returns `null` for paths that escape the serve root (defence in depth on
 * top of Bun's built-in path resolution — keeps `..` out of the response).
 */
const safeResolve = (serveRoot: string, urlPath: string): string | null => {
	const cleaned = urlPath.split('?')[0]?.split('#')[0] ?? '/';
	const decoded = decodeURIComponent(cleaned);
	if (decoded.includes('\0')) return null;
	const candidate = resolve(serveRoot, '.' + decoded);
	const normalisedRoot = serveRoot.endsWith('/')
		? serveRoot
		: `${serveRoot}/`;
	if (!candidate.startsWith(normalisedRoot) && candidate !== serveRoot)
		return null;
	return candidate;
};

const buildStaticHandler = (serveRoot: string) => {
	return async (req: Request): Promise<Response> => {
		const url = new URL(req.url);
		const path = safeResolve(serveRoot, url.pathname);
		if (!path) return new Response('Bad request', { status: 400 });
		if (!existsSync(path))
			return new Response('Not found', { status: 404 });
		const stat = await Bun.file(path).stat();
		if (stat.isDirectory()) {
			const indexHtml = join(path, 'index.html');
			if (existsSync(indexHtml)) return new Response(Bun.file(indexHtml));
			return new Response('Not found', { status: 404 });
		}
		return new Response(Bun.file(path));
	};
};

const startStatic = (target: ITarget): void => {
	const serveRoot = join(target.root, target.serveFrom ?? 'src');
	if (!existsSync(serveRoot)) {
		console.error(
			`[dev:${target.name}] serve root does not exist: ${serveRoot}`,
		);
		process.exit(1);
	}
	const server = Bun.serve({
		port: target.port,
		hostname: '0.0.0.0',
		development: true,
		fetch: buildStaticHandler(serveRoot),
	});
	console.log(`[dev:${target.name}] static ${serveRoot} → ${target.url}`);
	// Keep the handle alive for the lifetime of the process.
	process.once('exit', () => server.stop(true));
};

const startAstro = (target: ITarget): Subprocess => {
	// Inherit stdio so Astro's pretty logs land in the parent terminal.
	// `--host` exposes the port on the LAN; `astro dev` defaults to
	// localhost-only which is fine for `bun run dev` but inconvenient
	// when the user wants to test from a phone/tablet.
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

const main = (selected: ReadonlySet<string>): void => {
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
		if (target.kind === 'static') {
			startStatic(target);
		} else {
			children.push(startAstro(target));
		}
	}
	console.log(
		`[dev] up: ${targets.map((t) => `${t.name}=${t.url}`).join('  ')}`,
	);
	// If the user only asked for static targets, wait forever; if they
	// asked for astro, block on the first one (Astro's lifecycle owns
	// the foreground process).
	const astroChild = children[0];
	if (astroChild) {
		// Re-emit child exit so Ctrl-C in astro still tears down statics.
		astroChild.exited.then((code) => stop(code ?? 0));
	} else {
		process.stdin.resume();
	}
};

const argToTarget = (raw: string): string | null => {
	const trimmed = raw.replace(/^--?/, '').toLowerCase();
	if (['web', 'ide', 'vscode'].includes(trimmed)) return trimmed;
	return null;
};

const args = process.argv.slice(2);
const selected = new Set<string>();
if (args.length === 0) {
	// bare `dev` → all three
} else {
	for (const a of args) {
		const t = argToTarget(a);
		if (t) selected.add(t);
		else {
			console.error(`[dev] unknown target '${a}'`);
			process.exit(2);
		}
	}
}

main(selected);
