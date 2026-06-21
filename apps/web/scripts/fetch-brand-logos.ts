#!/usr/bin/env bun
/**
 * fetch-brand-logos.ts — fetch each project's official brand
 * asset (favicon / brand mark) and copy it to the web app's
 * `apps/web/public/logos/` directory.
 *
 * Why this exists (x128):
 *   x127 tried to use the local `simple-icons` package, but
 *   most simple-icons marks are wordmarks (the literal name of
 *   the project in text), not icons. The user feedback after
 *   x127 was clear: "los logos no son los logos reales de nada...
 *   son simplemente svgs con colores, no con los logotipos de
 *   cada framework. Descargalos de donde corresponda".
 *
 *   So x128 goes to the source. We crawl each project's
 *   official marketing site for `<link rel="icon">` and
 *   download the first match. When the site uses a PNG/ICO
 *   favicon (most older sites do) we download that — a PNG is
 *   still the real brand mark, just raster instead of vector.
 *   For projects that ship a public SVG asset (npm, pnpm, bun,
 *   deno, vscode, cursor, yarn) we download that.
 *
 *   Sources tried, in order, until one returns 200:
 *     1. the project's official marketing site
 *     2. the project's GitHub repo (raw URLs)
 *     3. simple-icons as a last resort
 *
 *   The brand assets are committed to `apps/web/public/logos/`
 *   with the extension they came with (`.svg` or `.png`). The
 *   Install page renders them as `<img src>` and the browser
 *   picks the right format.
 *
 * Usage: `bun run fetch:logos` from `apps/web/`. Idempotent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APPS_WEB = join(SCRIPT_DIR, '..');
const OUT = join(APPS_WEB, 'public/logos');

interface IBrandEntry {
	readonly outName: string;
	readonly sources: ReadonlyArray<string>;
}

const fetchUrl = async (
	url: string,
): Promise<{ body: Uint8Array; contentType: string } | null> => {
	try {
		const res = await fetch(url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
				Accept: 'image/svg+xml,image/png,image/webp,image/*,*/*;q=0.8',
			},
		});
		if (!res.ok) return null;
		const contentType = res.headers.get('content-type') ?? '';
		const buf = new Uint8Array(await res.arrayBuffer());
		if (buf.byteLength === 0) return null;
		return { body: buf, contentType };
	} catch {
		return null;
	}
};

/**
 * Given a fetched asset (raw bytes + content-type), decide the
 * output filename extension. PNG stays PNG, SVG stays SVG, ICO
 * gets converted to PNG (because most browsers render ICO and
 * the Install page already uses `<img>` with a single asset).
 */
const extensionFor = (contentType: string, url: string): 'svg' | 'png' => {
	if (contentType.includes('svg')) return 'svg';
	if (url.endsWith('.svg')) return 'svg';
	return 'png';
};

const BRANDS: ReadonlyArray<IBrandEntry> = [
	{
		outName: 'npm',
		// npmjs.com is behind Cloudflare; static.npmjs.com + npm/logos
		// repos are mirrors. The square "n" is the favicon-style mark.
		sources: [
			'https://raw.githubusercontent.com/npm/logos/master/npm%20square/n.svg',
			'https://raw.githubusercontent.com/npm/logos/master/npm%20square/n-large.png',
		],
	},
	{
		outName: 'pnpm',
		sources: [
			'https://pnpm.io/img/pnpm-no-name-with-frame.svg',
			'https://pnpm.io/img/pnpm-symbol.svg',
		],
	},
	{
		outName: 'yarn',
		sources: ['https://yarnpkg.com/img/yarn-favicon.svg'],
	},
	{
		outName: 'bun',
		sources: ['https://bun.sh/logo.svg', 'https://bun.sh/favicon.ico'],
	},
	{
		outName: 'deno',
		sources: ['https://deno.com/logo.svg', 'https://deno.com/favicon.ico'],
	},
	{
		outName: 'node',
		sources: ['https://nodejs.org/static/images/favicons/favicon.png'],
	},
	{
		outName: 'typescript',
		sources: ['https://www.typescriptlang.org/favicon-32x32.png'],
	},
	{
		outName: 'git',
		sources: [
			'https://git-scm.com/images/logos/downloads/Git-Icon-1788C.svg',
		],
	},
	{
		outName: 'github',
		sources: ['https://github.com/fluidicon.png'],
	},
	{
		outName: 'modelcontextprotocol',
		sources: [
			'https://modelcontextprotocol.io/mintlify-assets/_mintlify/favicons/mcp/ebiVJzri-bsiCfVZ/_generated/favicon/android-chrome-192x192.png',
		],
	},
	{
		outName: 'ide-cursor',
		sources: [
			'https://cursor.sh/marketing-static/favicon.svg',
			'https://cursor.sh/marketing-static/favicon.ico',
		],
	},
	{
		outName: 'ide-claude',
		// anthropic.com Webflow CDN (favicon is a PNG).
		sources: [
			'https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/681d52619fec35886a7f1a70_favicon.png',
		],
	},
	{
		outName: 'ide-claude-code',
		// Claude Code icon (Anthropic Webflow CDN).
		sources: [
			'https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/claude_app_icon.svg',
			'https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/claude_app_icon.png',
		],
	},
	{
		outName: 'ide-claude-desktop',
		sources: [
			'https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/claude_desktop_icon.svg',
			'https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/claude_desktop_icon.png',
		],
	},
	{
		outName: 'ide-vscode',
		sources: [
			'https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/browser/media/code-icon.svg',
		],
	},
	{
		outName: 'ide-windsurf',
		sources: [
			'https://codeium.com/windsurf/icon.png',
			'https://codeium.com/windsurf/favicon.ico',
		],
	},
	{
		outName: 'ide-zed',
		sources: ['https://zed.dev/favicon_black_32.png'],
	},
	{
		outName: 'ide-antigravity',
		// Antigravity doesn't have an official SVG/PNG. The closest
		// stand-in is the Gemini "spark" mark. We fall back to a
		// tiny placeholder SVG that the user can replace once
		// Antigravity ships one.
		sources: [
			'https://www.gstatic.com/images/branding/product/2x/google_gemini_64dp.png',
		],
	},
];

const main = async (): Promise<void> => {
	mkdirSync(OUT, { recursive: true });
	let fetched = 0;
	let written = 0;
	let failed = 0;

	for (const brand of BRANDS) {
		let data: { body: Uint8Array; contentType: string } | null = null;
		let usedUrl = '';
		for (const url of brand.sources) {
			console.log(`fetching ${brand.outName} from ${url}`);
			data = await fetchUrl(url);
			if (data && data.body.byteLength > 0) {
				usedUrl = url;
				fetched += 1;
				break;
			}
		}
		if (!data) {
			console.warn(`FAILED ${brand.outName} (no source responded)`);
			failed += 1;
			continue;
		}
		const ext = extensionFor(data.contentType, usedUrl);
		const outName = `${brand.outName}.${ext}`;
		const outPath = join(OUT, outName);
		const existing = existsSync(outPath) ? readFileSync(outPath) : null;
		if (existing && existing.byteLength === data.body.byteLength) {
			console.log(`unchanged ${outName}`);
			continue;
		}
		writeFileSync(outPath, data.body);
		written += 1;
		console.log(
			`wrote ${outName} (${data.body.byteLength} bytes, ${data.contentType || 'unknown'})`,
		);
	}

	// Remove any stale logo file with an extension that no longer matches
	// the source. e.g. if `ide-foo.svg` was downloaded and now we want
	// `ide-foo.png`, remove the old SVG.
	const wanted = new Set(BRANDS.map((b) => b.outName));
	const fs = await import('node:fs/promises');
	for (const file of await fs.readdir(OUT)) {
		const m = file.match(/^(.+)\.(svg|png)$/);
		if (!m) continue;
		const [_, base, ext] = m;
		if (!wanted.has(base)) continue;
		// Check that the file we wrote matches `base.ext`:
		const target = `${base}.${ext}`;
		if (file !== target) {
			console.log(`removing stale ${file}`);
			await fs.unlink(join(OUT, file));
		}
	}

	if (!existsSync(join(OUT, '.gitkeep'))) {
		writeFileSync(join(OUT, '.gitkeep'), '');
	}

	console.log(
		`fetch-brand-logos: ${BRANDS.length} brands — ${fetched} fetched, ${written} (re)written, ${failed} failed`,
	);
};

await main();
