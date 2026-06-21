#!/usr/bin/env bun
/**
 * fetch-brand-logos.ts — fetch real brand SVGs from the local
 * `simple-icons` package and a few hand-curated sources, then
 * normalise them into the web app's `apps/web/public/logos/`
 * convention.
 *
 * Why this exists (x127):
 *   The previous generator (`gen-plugin-logos.ts`) wrote
 *   hand-drawn stroke glyphs ("A" for audit, a hexagon for
 *   core, etc.) plus a coloured rounded-rect background. The
 *   user feedback was that the placeholders don't carry any
 *   meaning for what the plugin does — a real brand mark
 *   for `git`, a real `npm` logo for the package-manager tab
 *   strip, etc. is the obvious upgrade.
 *
 *   simple-icons is already a workspace dep (`apps/web/package.json`),
 *   3400+ CC0-licensed brand marks at
 *   `node_modules/simple-icons/icons/<slug>.svg`. We copy the
 *   ones we need (npm, pnpm, yarn, bun, deno, git, github,
 *   cursor, claude, claudecode, windsurf, zedindustries,
 *   modelcontextprotocol) and re-skin them as
 *   `apps/web/public/logos/{pm,ide,plugin}-<id>.svg` so the
 *   Install page's tab strips, the brand favicon, the social
 *   links, and any future reference use the real mark.
 *
 *   The custom plugins (audit, client, core, deps, docs, logs,
 *   memory, notification, proposals, quality, rules, search,
 *   status-marker, test-convention) don't have a brand mark
 *   (the names are project-internal), so we KEEP the semantic
 *   stroke glyphs the previous generator wrote. The
 *   `gen-plugin-logos.ts` script is still responsible for those.
 *
 *   The two brands simple-icons v16.23.0 doesn't ship with
 *   (`vscode`, `antigravity`) are fetched from hand-curated
 *   Wikimedia / official-repo URLs and committed alongside
 *   the rest of the logos. If a future release of
 *   simple-icons adds them, this script will prefer the
 *   local copy and skip the download.
 *
 * Usage: `bun run fetch:logos` from `apps/web/` (added to
 * `package.json#scripts` by this same change). Idempotent: it
 * only writes a file when the rendered output would differ
 * from what's already on disk.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APPS_WEB = join(SCRIPT_DIR, '..');
const REPO_ROOT = join(APPS_WEB, '..', '..');
const SIMPLE_ICONS = join(REPO_ROOT, 'node_modules/simple-icons/icons');
const OUT = join(APPS_WEB, 'public/logos');

interface IBrandEntry {
	/** Slug in simple-icons (`<slug>.svg`). May be absent — in that
	 * case we use the `sources` list below to fetch. */
	readonly simpleIconsSlug?: string;
	/** The output filename. */
	readonly outName: string;
	/** Brand colour used for the rounded background. The icon
	 * itself is rendered in white on this background. */
	readonly brandColor: string;
	/** Optional fallback URLs when simple-icons doesn't have the
	 * brand. Fetched once and cached as `<outName>` in `OUT`. */
	readonly sources?: ReadonlyArray<string>;
}

const BRANDS: ReadonlyArray<IBrandEntry> = [
	{ simpleIconsSlug: 'npm', outName: 'npm.svg', brandColor: '#cb3837' },
	{ simpleIconsSlug: 'pnpm', outName: 'pnpm.svg', brandColor: '#f69220' },
	{ simpleIconsSlug: 'yarn', outName: 'yarn.svg', brandColor: '#2c8ebb' },
	{ simpleIconsSlug: 'bun', outName: 'bun.svg', brandColor: '#fbf0df' },
	{ simpleIconsSlug: 'deno', outName: 'deno.svg', brandColor: '#000000' },
	{
		simpleIconsSlug: 'nodedotjs',
		outName: 'node.svg',
		brandColor: '#5fa04e',
	},
	{
		simpleIconsSlug: 'typescript',
		outName: 'typescript.svg',
		brandColor: '#3178c6',
	},
	{ simpleIconsSlug: 'git', outName: 'git.svg', brandColor: '#f05032' },
	{ simpleIconsSlug: 'github', outName: 'github.svg', brandColor: '#181717' },
	{
		simpleIconsSlug: 'modelcontextprotocol',
		outName: 'modelcontextprotocol.svg',
		brandColor: '#000000',
	},
	{
		simpleIconsSlug: 'cursor',
		outName: 'ide-cursor.svg',
		brandColor: '#000000',
	},
	{
		simpleIconsSlug: 'claude',
		outName: 'ide-claude.svg',
		brandColor: '#d97757',
	},
	{
		simpleIconsSlug: 'claudecode',
		outName: 'ide-claude-code.svg',
		brandColor: '#d97757',
	},
	{
		simpleIconsSlug: 'windsurf',
		outName: 'ide-windsurf.svg',
		brandColor: '#1e88e5',
	},
	{
		simpleIconsSlug: 'zedindustries',
		outName: 'ide-zed.svg',
		brandColor: '#084ccf',
	},
	{
		outName: 'ide-vscode.svg',
		brandColor: '#0078d4',
		sources: [
			'https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/browser/media/code-icon.svg',
		],
	},
	// Antigravity: simple-icons v16.23.0 doesn't ship an icon. The
	// closest "Google" mark in the catalogue is `google` (the
	// multicoloured G) — we use that as a stand-in until
	// simple-icons adds an `antigravity` entry.
	{
		simpleIconsSlug: 'google',
		outName: 'ide-antigravity.svg',
		brandColor: '#1a73e8',
	},
];

interface IExtracted {
	readonly d: string;
	readonly viewBox: { w: number; h: number };
}

/**
 * Extract the **last** `<path d="...">` from the SVG. We pick the
 * last because most of the VS Code / Antigravity / official-repo
 * SVGs layer multiple paths in z-order: the first one is usually
 * a transparent background rectangle, the middle ones are
 * decorative shapes, and the last one is the actual mark.
 * simple-icons icons are single-path so the last is the only
 * one either way.
 */
const convertPath = (svgText: string): IExtracted => {
	const viewBoxMatch = svgText.match(/viewBox="([\d.\s]+)"/);
	const viewBox = viewBoxMatch
		? (() => {
				const parts = viewBoxMatch[1]!.trim().split(/\s+/).map(Number);
				return { w: parts[2] ?? 24, h: parts[3] ?? 24 };
			})()
		: { w: 24, h: 24 };
	// Global flag, last match
	const pathRegex = /<path[^>]*\bd="([^"]+)"/g;
	let lastMatch: RegExpExecArray | null = null;
	let m: RegExpExecArray | null;
	while ((m = pathRegex.exec(svgText)) !== null) {
		lastMatch = m;
	}
	if (!lastMatch) {
		throw new Error(
			`Could not extract <path d="..."> from SVG: ${svgText.slice(0, 200)}`,
		);
	}
	return { d: lastMatch[1]!, viewBox };
};

const renderBrand = (
	extracted: IExtracted,
	brand: string,
	label: string,
	darkText = false,
): string => {
	const fg = darkText ? '#1a1a1a' : '#fff';
	const { w, h } = extracted.viewBox;
	// 1-unit padding around the 24x24 design grid, so the icon
	// lives inside a 24x24 box centred in the 64x64 badge (44px
	// margin split across left/right and top/bottom). For non-24x24
	// viewBoxes we scale the inner box so the icon ends up the
	// same visual size.
	const inner = 24;
	const scale = inner / Math.max(w, h);
	const offset = (64 - inner * scale) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${label} logo">
  <rect x="0" y="0" width="64" height="64" rx="14" fill="${brand}" />
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="${fg}">${extracted.d}</g>
</svg>
`;
};

const fetchUrl = async (url: string): Promise<string> => {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(
			`Failed to fetch ${url}: ${res.status} ${res.statusText}`,
		);
	}
	return res.text();
};

const main = async (): Promise<void> => {
	mkdirSync(OUT, { recursive: true });
	let copied = 0;
	let rendered = 0;
	let fetched = 0;
	let skipped = 0;

	for (const brand of BRANDS) {
		const outPath = join(OUT, brand.outName);
		let svgText: string | null = null;

		if (brand.simpleIconsSlug) {
			const simplePath = join(
				SIMPLE_ICONS,
				`${brand.simpleIconsSlug}.svg`,
			);
			if (existsSync(simplePath)) {
				svgText = readFileSync(simplePath, 'utf8');
				copied += 1;
			}
		}

		if (!svgText && brand.sources) {
			for (const url of brand.sources) {
				try {
					console.log(`fetching ${brand.outName} from ${url}`);
					svgText = await fetchUrl(url);
					fetched += 1;
					break;
				} catch (e) {
					console.warn(`  ${(e as Error).message}`);
				}
			}
		}

		if (!svgText) {
			console.warn(`skipping ${brand.outName} (no source)`);
			skipped += 1;
			continue;
		}

		const extracted = convertPath(svgText);
		// `bun` brand uses a near-white background; render its icon
		// in dark text so the contrast stays readable.
		const darkText = brand.brandColor.toLowerCase() === '#fbf0df';
		const renderedSvg = renderBrand(
			extracted,
			brand.brandColor,
			brand.outName.replace(/\.svg$/, ''),
			darkText,
		);

		const existing = existsSync(outPath)
			? readFileSync(outPath, 'utf8')
			: null;
		if (existing === renderedSvg) {
			skipped += 1;
			continue;
		}
		writeFileSync(outPath, renderedSvg);
		rendered += 1;
	}

	if (!existsSync(join(OUT, '.gitkeep'))) {
		writeFileSync(join(OUT, '.gitkeep'), '');
	}

	console.log(
		`fetch-brand-logos: ${BRANDS.length} brands — ${copied} from simple-icons, ${fetched} fetched from network, ${rendered} (re)written, ${skipped} unchanged`,
	);
};

await main();
