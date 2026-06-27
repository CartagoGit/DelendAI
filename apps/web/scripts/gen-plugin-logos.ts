#!/usr/bin/env bun
/**
 * gen-plugin-logos.ts — generate semantic SVG icons for every plugin, IDE,
 * and package manager referenced from the web app.
 *
 * The web app references three logo families via `<img src="/logos/…">`:
 *
 *   1. `plugin-<slug>.svg` — 36×36, used in `PluginsSection.astro` and
 *      `PluginCapabilities.astro` for every card. The "real" plugin
 *      logos don't exist as design assets, so this script writes a
 *      deterministic, theme-agnostic icon per plugin: a per-plugin HSL
 *      colour for the background and a per-slug white-stroke icon that
 *      hints at what the plugin does (a magnifier for `audit`, a tree
 *      for `git`, a chain link for `deps`, etc.). The previous
 *      placeholder used the slug's first letter as a glyph; x126
 *      replaced that with semantic stroke icons so the user can tell
 *      the plugins apart at a glance.
 *   2. `<pm>.svg` (npm, pnpm, yarn, bun, deno) — 64×64, used by the
 *      markdown-backed /install page (f00055 S6) for the package-manager
 *      tab strip. These had been 404s on every fresh dev server (x126 S4)
 *      and are now generated as part of the same script.
 *   3. `ide-<id>.svg` (vscode, cursor, windsurf, antigravity, zed,
 *      claude-code, claude-desktop) — 64×64, used by the same
 *      markdown-backed /install page for the IDE tab strip.
 *
 * The output is checked in to `apps/web/public/logos/` so the dev
 * server serves them without a generator round-trip. The build does
 * not re-run this script (the assets are static); the script is
 * idempotent and runnable manually if a new plugin / PM / IDE is
 * added.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APPS_WEB = join(SCRIPT_DIR, '..');
const CAPABILITIES = join(APPS_WEB, 'src/data/manifests/capabilities.json');
const OUT = join(APPS_WEB, 'public/logos');

interface ICapPackage {
	name: string;
	version: string;
}

const shortName = (n: string): string =>
	n.replace('@mcp-vertex/', '').replace('@mcp-vertex/', '');

// Tiny deterministic string → 32-bit hash. djb2; collision rate is fine
// for a 27-item palette and the result stays in [0, 360).
const hashHue = (s: string): number => {
	let h = 5381;
	for (let i = 0; i < s.length; i += 1) {
		h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
	}
	return h % 360;
};

// Per-plugin icon. Each path is rendered inside a 36×36 viewBox at
// (8,8) with a 20×20 inner box, stroke="white", fill="none",
// stroke-width=2, stroke-linecap=round. Keep paths short and centred.
const PLUGIN_ICONS: Readonly<Record<string, string>> = {
	audit: '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 10h6M7 7h6M7 13h3"/><circle cx="15.5" cy="15.5" r="3.5"/><path d="M18 18l2 2"/>',
	client: '<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M6 8l3 2-3 2M11 12h3"/>',
	core: '<polygon points="10,2 17,6 17,14 10,18 3,14 3,6"/><circle cx="10" cy="10" r="2.5"/>',
	deps: '<path d="M7 10a3 3 0 1 1 6 0a3 3 0 1 1-6 0"/><path d="M5 5l-2 2M15 5l2 2M5 15l-2-2M15 15l2-2"/>',
	docs: '<path d="M4 3h9l3 3v11H4z"/><path d="M13 3v3h3M7 9h6M7 12h6M7 15h4"/>',
	git: '<circle cx="5" cy="5" r="2"/><circle cx="5" cy="15" r="2"/><circle cx="15" cy="10" r="2"/><path d="M5 7v6M7 10h6M5 10h2"/>',
	logs: '<path d="M3 4h14M3 8h14M3 12h10M3 16h7"/>',
	memory: '<rect x="3" y="6" width="14" height="8" rx="1"/><path d="M6 3v3M10 3v3M14 3v3M6 14v3M10 14v3M14 14v3"/>',
	notification:
		'<path d="M5 15V9a5 5 0 0 1 10 0v6l2 2H3z"/><path d="M8 18a2 2 0 0 0 4 0"/>',
	proposals:
		'<rect x="3" y="3" width="11" height="14" rx="1"/><path d="M6 8h6M6 11h6M6 14h4"/><path d="M14 6l3 3-3 3"/>',
	quality:
		'<path d="M10 2l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V5z"/><path d="M7 10l2 2 4-4"/>',
	rules: '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M6 7h8M6 10h8M6 13h5"/>',
	search: '<circle cx="9" cy="9" r="5"/><path d="M13 13l4 4"/>',
	'status-marker':
		'<circle cx="10" cy="10" r="3"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3M4 4l2 2M14 14l2 2M4 16l2-2M14 6l2-2"/>',
	'test-convention':
		'<circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/>',
};

// Brand-stable colour overrides for the PM / IDE logos so the user
// can recognise the family at a glance. These are unofficial
// approximations, not the real brand marks.
const PM_BRAND: Readonly<Record<string, string>> = {
	npm: '#cb3837',
	pnpm: '#f69220',
	yarn: '#2c8ebb',
	bun: '#fbf0df',
	deno: '#000000',
};
const IDE_BRAND: Readonly<Record<string, string>> = {
	vscode: '#0078d4',
	cursor: '#000000',
	windsurf: '#0078d4',
	antigravity: '#1a73e8',
	zed: '#084ccf',
	'claude-code': '#d97757',
	'claude-desktop': '#d97757',
};

const renderPlugin = (slug: string): string => {
	const hue = hashHue(slug);
	const icon =
		PLUGIN_ICONS[slug] ??
		'<rect x="6" y="6" width="12" height="12" rx="2"/>';
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" role="img" aria-label="${slug} plugin logo">
	<rect x="0" y="0" width="36" height="36" rx="8" fill="hsl(${hue} 55% 45%)" />
	<g transform="translate(8 8)" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
</svg>
`;
};

const renderTextLogo = (id: string, brand: string, text: string): string => {
	const fill = brand || `hsl(${hashHue(id)} 55% 45%)`;
	// Dark text on light brand backgrounds (bun is the only light
	// brand), white on every other one.
	const fg = brand.toLowerCase() === '#fbf0df' ? '#1a1a1a' : '#fff';
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${id} logo">
	<rect x="0" y="0" width="64" height="64" rx="14" fill="${fill}" />
	<text x="32" y="44" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="26" font-weight="800" fill="${fg}">${text}</text>
</svg>
`;
};

const main = (): void => {
	const cap = JSON.parse(readFileSync(CAPABILITIES, 'utf8')) as {
		packages: ICapPackage[];
	};
	const slugs = cap.packages.map((p) => shortName(p.name)).sort();
	mkdirSync(OUT, { recursive: true });

	let written = 0;

	// 1. Plugin icons (36×36 with semantic stroke glyph).
	for (const slug of slugs) {
		writeFileSync(join(OUT, `plugin-${slug}.svg`), renderPlugin(slug));
		written += 1;
	}

	// 2. Package-manager icons (64×64 with brand colour + initial).
	const PM_IDS = ['npm', 'pnpm', 'yarn', 'bun', 'deno'] as const;
	for (const id of PM_IDS) {
		const letter = id.charAt(0).toUpperCase();
		writeFileSync(
			join(OUT, `${id}.svg`),
			renderTextLogo(id, PM_BRAND[id] ?? '', letter),
		);
		written += 1;
	}

	// 3. IDE icons (64×64 with brand colour + 1-2 char label).
	const IDE_IDS = [
		'vscode',
		'cursor',
		'windsurf',
		'claude-code',
		'claude-desktop',
		'antigravity',
		'zed',
	] as const;
	for (const id of IDE_IDS) {
		const text =
			id === 'claude-code'
				? 'Cc'
				: id === 'claude-desktop'
					? 'Cd'
					: id.charAt(0).toUpperCase();
		writeFileSync(
			join(OUT, `ide-${id}.svg`),
			renderTextLogo(id, IDE_BRAND[id] ?? '', text),
		);
		written += 1;
	}

	// `.gitkeep` so the folder survives an empty regenerate (e.g. when
	// a plugin is renamed and the corresponding SVG is removed).
	writeFileSync(join(OUT, '.gitkeep'), '');
	console.log(
		`wrote ${written} logos to ${OUT} (${slugs.length} plugins, ${PM_IDS.length} PMs, ${IDE_IDS.length} IDEs)`,
	);
};

main();
