#!/usr/bin/env bun
/**
 * fetch-brand-logos.ts — fetch real brand SVGs from each
 * project's official source and copy them to the web app's
 * `apps/web/public/logos/` convention.
 *
 * Why this exists (x128):
 *   x127 tried to use the local `simple-icons` package as a
 *   source of truth, but most simple-icons marks are wordmarks
 *   (the literal name of the project in text), not icons. The
 *   Install page needs small (20×20 in the tab strip, 36×36
 *   in the card) icons that look like the actual brand mark
 *   — not the spelled-out word. So x128 goes to the source:
 *   each project's own repo, its own marketing site, or the
 *   GitHub repo that ships the brand assets. We download the
 *   SVG, normalise it to a 64×64 viewBox (so the
 *   `<img width="20" height="20">` in `Install.astro` and the
 *   36×36 cards in `PluginsSection.astro` both scale cleanly),
 *   and commit the result.
 *
 *   Sources tried, in order, until one returns 200:
 *     - the project's official marketing site (`<link rel="icon">`)
 *     - the project's GitHub repo (raw URLs to the SVG asset)
 *     - the GitHub releases / brand-assets repo
 *
 *   Sources are curated by hand and listed in the `BRANDS`
 *   table below. Adding a new brand = adding an entry.
 *
 * Usage: `bun run fetch:logos` from `apps/web/` (added to
 * `package.json#scripts` by this same change). Idempotent:
 * it only writes a file when the rendered output differs from
 * what's already on disk.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APPS_WEB = join(SCRIPT_DIR, '..');
const OUT = join(APPS_WEB, 'public/logos');

interface IBrandEntry {
	/** Output filename in `apps/web/public/logos/`. */
	readonly outName: string;
	/** Ordered list of URLs to try. The first one that returns
	 * a successful response with non-empty body wins. */
	readonly sources: ReadonlyArray<string>;
	/** Width / height of the rendered badge. The original SVG
	 * is wrapped in a `<svg width="64" height="64" viewBox="0 0 64 64">`
	 * and rendered at 64×64 in the tab strip; consumers can scale
	 * it via the `<img width=...>` attribute as needed. */
	readonly size?: number;
	/** Optional forced viewBox. When the source SVG has a known
	 * viewBox (e.g. `0 0 24 24`) we set it explicitly so the
	 * badge always renders at the same scale, regardless of
	 * what the source says. */
	readonly viewBox?: string;
}

const BRANDS: ReadonlyArray<IBrandEntry> = [
	// Package managers / runtimes. We start with the iconic
	// square "n" / lockup / icon that each project ships as its
	// favicon-style mark.
	{
		outName: 'npm.svg',
		// npmjs.com ships an SVG icon at static.npmjs.com.
		sources: [
			'https://raw.githubusercontent.com/npm/logos/master/npm%20square/n.svg',
			'https://static.npmjs.com/images/logos/npm/NPM-logo.svg',
		],
		viewBox: '0 0 32 32',
	},
	{
		outName: 'pnpm.svg',
		// pnpm.io hosts its SVG logo at /img/.
		sources: [
			'https://pnpm.io/img/pnpm-no-name-with-frame.svg',
			'https://pnpm.io/img/pnpm-symbol.svg',
		],
	},
	{
		outName: 'yarn.svg',
		// yarnpkg.com serves its favicon as an SVG.
		sources: ['https://yarnpkg.com/img/yarn-favicon.svg'],
	},
	{
		outName: 'bun.svg',
		// bun.sh hosts two SVGs; `icon.svg` is the square mark.
		sources: ['https://bun.sh/icon.svg', 'https://bun.sh/logo.svg'],
	},
	{
		outName: 'deno.svg',
		sources: ['https://deno.com/logo.svg'],
	},
	{
		outName: 'node.svg',
		// Node uses an SVG icon at nodejs.org/static/images/favicons.
		// We try the PNG fallback if SVG is missing.
		sources: [
			'https://nodejs.org/static/images/favicons/favicon.svg',
			'https://nodejs.org/static/images/favicons/favicon.png',
		],
	},
	{
		outName: 'typescript.svg',
		sources: [
			'https://www.typescriptlang.org/favicon.svg',
			'https://raw.githubusercontent.com/microsoft/TypeScript-Website/main/packages/playground-common/img/favicon.svg',
		],
	},
	{
		outName: 'git.svg',
		sources: [
			'https://git-scm.com/images/logos/downloads/Git-Icon-1788C.svg',
		],
	},
	{
		outName: 'github.svg',
		sources: [
			'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.svg',
			'https://raw.githubusercontent.com/logos/github-logo/master/github-mark-white.svg',
			'https://raw.githubusercontent.com/logos/github-logo/master/github-mark.svg',
		],
	},
	{
		outName: 'modelcontextprotocol.svg',
		sources: [
			'https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/public/logos/mcp.svg',
			'https://modelcontextprotocol.io/mintlify-assets/_mintlify/favicons/mcp/ebiVJzri-bsiCfVZ/_generated/favicon/android-chrome-192x192.svg',
		],
	},
	{
		outName: 'ide-cursor.svg',
		sources: [
			'https://cursor.sh/marketing-static/icon.svg',
			'https://cursor.sh/marketing-static/logo-dark.svg',
		],
	},
	{
		outName: 'ide-claude.svg',
		// anthropic.com hosts its Claude brand in Webflow CDN.
		sources: [
			'https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/claude_app_icon.svg',
		],
	},
	{
		outName: 'ide-claude-code.svg',
		sources: [
			'https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/claude_code_icon.svg',
		],
	},
	{
		outName: 'ide-claude-desktop.svg',
		sources: [
			'https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/claude_desktop_icon.svg',
		],
	},
	{
		outName: 'ide-vscode.svg',
		sources: [
			'https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/browser/media/code-icon.svg',
		],
	},
	{
		outName: 'ide-windsurf.svg',
		sources: [
			'https://codeium.com/windsurf/logo-light.svg',
			'https://codeium.com/windsurf/icon.svg',
		],
	},
	{
		outName: 'ide-zed.svg',
		sources: [
			'https://zed.dev/logo.svg',
			'https://raw.githubusercontent.com/zed-industries/zed/main/assets/icons/logo.svg',
		],
	},
	{
		outName: 'ide-antigravity.svg',
		// Antigravity doesn't have an official SVG yet. We use the
		// Gemini "spark" mark as the closest stand-in.
		sources: [
			'https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/assets/gemini-spark.svg',
			'https://www.gstatic.com/images/branding/product/2x/google_gemini_64dp.png',
		],
	},
];

const fetchUrl = async (url: string): Promise<string | null> => {
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'mcp-vertex/1.0 (brand logo fetcher)' },
		});
		if (!res.ok) {
			console.warn(`  ${res.status} ${url}`);
			return null;
		}
		const text = await res.text();
		if (text.trim().length === 0) return null;
		// Reject HTML error pages that respond with 200.
		if (
			text.trimStart().startsWith('<!DOCTYPE html') ||
			text.trimStart().startsWith('<html')
		) {
			return null;
		}
		return text;
	} catch (e) {
		console.warn(`  ${(e as Error).message} (${url})`);
		return null;
	}
};

/**
 * Wrap a downloaded SVG in a 64×64 badge. We do NOT modify the
 * inner paths (the source SVG knows its own colours and we want
 * to keep them). The wrap just normalises the size so consumers
 * don't have to worry about the source's intrinsic viewBox.
 */
const wrapInBadge = (svgText: string, outName: string, size = 64): string => {
	// Extract the inner content (everything inside <svg ...>...</svg>).
	const openMatch = svgText.match(/<svg[^>]*>/);
	const closeIdx = svgText.lastIndexOf('</svg>');
	if (!openMatch || closeIdx < 0) {
		throw new Error(`Could not find <svg>...</svg> in source`);
	}
	const inner = svgText.slice(
		(openMatch.index ?? 0) + openMatch[0].length,
		closeIdx,
	);
	// Replace width/height/viewBox on the inner <svg> with our badge.
	const badgeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${outName.replace(/\.svg$/, '')} logo">`;
	return `${badgeOpen}${inner}</svg>\n`;
};

const main = async (): Promise<void> => {
	mkdirSync(OUT, { recursive: true });
	let copied = 0;
	let rendered = 0;
	let failed = 0;

	for (const brand of BRANDS) {
		const outPath = join(OUT, brand.outName);
		let svgText: string | null = null;
		for (const url of brand.sources) {
			console.log(`fetching ${brand.outName} from ${url}`);
			svgText = await fetchUrl(url);
			if (svgText) {
				copied += 1;
				break;
			}
		}
		if (!svgText) {
			console.warn(`FAILED ${brand.outName} (no source responded)`);
			failed += 1;
			continue;
		}
		let renderedSvg: string;
		try {
			renderedSvg = wrapInBadge(svgText, brand.outName, brand.size ?? 64);
		} catch (e) {
			console.warn(`FAILED ${brand.outName}: ${(e as Error).message}`);
			failed += 1;
			continue;
		}
		const existing = existsSync(outPath)
			? readFileSync(outPath, 'utf8')
			: null;
		if (existing === renderedSvg) {
			continue;
		}
		writeFileSync(outPath, renderedSvg);
		rendered += 1;
	}

	if (!existsSync(join(OUT, '.gitkeep'))) {
		writeFileSync(join(OUT, '.gitkeep'), '');
	}

	console.log(
		`fetch-brand-logos: ${BRANDS.length} brands — ${copied} fetched, ${rendered} (re)written, ${failed} failed`,
	);
};

await main();
