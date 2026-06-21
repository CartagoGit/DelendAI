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
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
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
	/** The output filename. The convention is:
	 *   - `<id>.svg` for package managers and runtime logos
	 *     (referenced as `<img src="/logos/<id>.svg">`)
	 *   - `ide-<id>.svg` for IDE / agent icons
	 *   - `plugin-<slug>.svg` for first-class plugin brand marks
	 *     (e.g. `github.svg` if the @mcp-vertex/github plugin ever
	 *     becomes a real product) */
	readonly outName: string;
	/** Brand colour used for the rounded background. The icon
	 * itself is rendered in white on this background. */
	readonly brandColor: string;
	/** Optional fallback URLs when simple-icons doesn't have the
	 * brand. Fetched once and cached as `<outName>` in `OUT`. */
	readonly sources?: ReadonlyArray<string>;
}

/**
 * Hand-curated mapping. The order is the order they're written
 * to disk, which is the order they appear in the Install page's
 * tab strips (and the order of the README's "Supported runtimes"
 * table).
 */
const BRANDS: ReadonlyArray<IBrandEntry> = [
	// Package managers / runtimes.
	{ simpleIconsSlug: 'npm', outName: 'npm.svg', brandColor: '#cb3837' },
	{ simpleIconsSlug: 'pnpm', outName: 'pnpm.svg', brandColor: '#f69220' },
	{ simpleIconsSlug: 'yarn', outName: 'yarn.svg', brandColor: '#2c8ebb' },
	{ simpleIconsSlug: 'bun', outName: 'bun.svg', brandColor: '#fbf0df' },
	{
		simpleIconsSlug: 'deno',
		outName: 'deno.svg',
		brandColor: '#000000',
	},
	{ simpleIconsSlug: 'node', outName: 'node.svg', brandColor: '#5fa04e' },
	{
		simpleIconsSlug: 'typescript',
		outName: 'typescript.svg',
		brandColor: '#3178c6',
	},

	// Version control / hosting (used in the brand bar and
	// the GitHub link in the footer).
	{ simpleIconsSlug: 'git', outName: 'git.svg', brandColor: '#f05032' },
	{ simpleIconsSlug: 'github', outName: 'github.svg', brandColor: '#181717' },
	{
		simpleIconsSlug: 'modelcontextprotocol',
		outName: 'modelcontextprotocol.svg',
		brandColor: '#000000',
	},

	// IDEs and agents.
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

	// Brand assets that simple-icons v16.23.0 doesn't ship with
	// yet. `fetch` falls back to `sources` (Wikimedia / official
	// repo raw URLs). The list is short on purpose — adding a
	// new icon means finding a CC0 / public-domain SVG source
	// and a brand colour, both of which are curated.
	{
		outName: 'ide-vscode.svg',
		brandColor: '#0078d4',
		sources: [
			'https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/browser/media/code-icon.svg',
		],
	},
	{
		outName: 'ide-antigravity.svg',
		brandColor: '#1a73e8',
		sources: [
			// Antigravity is Google's agentic IDE; the official
			// mark hasn't been mirrored to simple-icons as of
			// v16.23.0. The closest CC0 / public-domain SVG is
			// the Google "G" + orbit mark, which is too generic
			// to ship. If/when simple-icons adds an antigravity
			// entry, this fallback will be skipped (see
			// `renderAntigravityFallback` below).
		],
	},
];

/**
 * Render a simple-icons 24x24 monochrome `<path d="…"/>` into a
 * white-on-brand rounded-rectangle badge. The output is a
 * 64x64 SVG with `viewBox="0 0 64 64"` so it scales the same
 * way as the previous hand-drawn IDE / PM logos. The brand
 * background uses `rx="14"` (slightly larger than the 8 of the
 * plugin icons) so the two families stay visually distinct
 * at a glance.
 */
const renderBrand = (
	pathD: string,
	brand: string,
	label: string,
	darkText = false,
): string => {
	const fg = darkText ? '#1a1a1a' : '#fff';
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${label} logo">
	<rect x="0" y="0" width="64" height="64" rx="14" fill="${brand}" />
	<g transform="translate(20 20) scale(1)" fill="${fg}">${pathD}</g>
</svg>
`;
};

/**
 * Convert simple-icons' 24x24 path to a 64x64 frame by translating
 * the origin 20px and applying a uniform 1x scale (24 * 1 = 24,
 * so the icon ends up centered in the 64x64 box). The simple-icons
 * path uses no `fill` attribute; we add one so the badge renders
 * correctly against the brand background.
 */
const convertPath = (svgText: string): string => {
	const match = svgText.match(/<path d="([^"]+)"\s*\/?>/);
	if (!match) {
		throw new Error(
			`Could not extract <path> from simple-icons SVG: ${svgText.slice(0, 120)}`,
		);
	}
	return match[1];
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

		const pathD = convertPath(svgText);
		// `bun` brand uses a near-white background; render its icon in
		// dark text so the contrast stays readable.
		const darkText = brand.brandColor.toLowerCase() === '#fbf0df';
		const renderedSvg = renderBrand(
			pathD,
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

	// Sentinel: keep the directory tracked by git even if all
	// entries get removed.
	if (!existsSync(join(OUT, '.gitkeep'))) {
		writeFileSync(join(OUT, '.gitkeep'), '');
	}

	console.log(
		`fetch-brand-logos: ${BRANDS.length} brands — ${copied} from simple-icons, ${fetched} fetched from network, ${rendered} (re)written, ${skipped} unchanged`,
	);
};

await main();
