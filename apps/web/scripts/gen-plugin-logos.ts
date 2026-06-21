#!/usr/bin/env bun
/**
 * gen-plugin-logos.ts — generate placeholder SVG logos for every plugin
 * listed in `capabilities.json`.
 *
 * The web app's `PluginsSection.astro` and `PluginCapabilities.astro`
 * each render an `<img src="/logos/plugin-<slug>.svg">` per card. The
 * dev server has no such assets, so every page that lists plugins
 * shipped a wall of `404 (Not Found)` lines in the browser console
 * (x125). The "real" plugin logos do not exist as design assets, so
 * this script writes a deterministic, theme-agnostic placeholder per
 * plugin:
 *
 *   - 36×36 viewBox, square with rounded corners.
 *   - Background: a per-plugin HSL colour derived from a stable
 *     hash of the slug, so each card has its own visual identity but
 *     the family stays in the same hue band (sat 55%, lum 45%).
 *   - Foreground: the slug's first character, capitalised, in
 *     white, weight 700, centered.
 *
 * The output is checked in to `apps/web/public/logos/` so the dev
 * server serves them without a generator round-trip. The build does
 * not re-run this script (the assets are static); the script is
 * idempotent and runnable manually if a new plugin is added.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAPABILITIES = join(
	ROOT,
	'apps/web/src/data/manifests/capabilities.json',
);
const OUT = join(ROOT, 'apps/web/public/logos');

interface ICapPackage {
	name: string;
	version: string;
}

const shortName = (n: string): string =>
	n.replace('@mcp-vertex/', '').replace('@mcp-vertex/', '');

// Tiny deterministic string → 32-bit hash. djb2; collision rate is fine
// for a 15-item palette and the result stays in [0, 360).
const hashHue = (s: string): number => {
	let h = 5381;
	for (let i = 0; i < s.length; i += 1) {
		h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
	}
	return h % 360;
};

// A slug is 1-15 chars, all lowercase + hyphens. We map its first
// character to a 1-3 char display label so the card is recognisable
// at a glance. `quality` → `Q`, `mcp-vertex_knowledge` → `Mv` (first
// letter of each dash-separated word, up to two letters, then
// capitalised).
const labelFor = (slug: string): string => {
	const words = slug.split(/[-_]/).filter(Boolean).slice(0, 2);
	const letters = words.map((w) => w[0]?.toUpperCase() ?? '').join('');
	return letters || slug[0]?.toUpperCase() || '?';
};

const renderLogo = (slug: string): string => {
	const hue = hashHue(slug);
	const label = labelFor(slug);
	// Slight per-plugin variation: 45% lum + 0-15% sat offset keeps the
	// family tight but not flat.
	const sat = 55;
	const lum = 45;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" role="img" aria-label="${slug} plugin logo">
	<rect x="0" y="0" width="36" height="36" rx="8" fill="hsl(${hue} ${sat}% ${lum}%)" />
	<text x="18" y="22" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="700" fill="#fff">${label}</text>
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
	for (const slug of slugs) {
		writeFileSync(join(OUT, `plugin-${slug}.svg`), renderLogo(slug));
		written += 1;
	}
	// `.gitkeep` so the folder survives an empty regenerate (e.g. when
	// a plugin is renamed and the corresponding SVG is removed).
	writeFileSync(join(OUT, '.gitkeep'), '');
	console.log(
		`wrote ${written} plugin logos to ${OUT} (slugs: ${slugs.join(', ')})`,
	);
};

main();
