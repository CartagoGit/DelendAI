// @ts-check
import { defineConfig } from 'astro/config';
import { resolve } from 'node:path';

// Local import aliases (`#MAYÚSCULAS/*`, see p112 §1). Single source of truth
// in `scripts/lib/local-aliases.mjs`; both `vite.resolve.alias` (runtime)
// and `tsconfig.json#compilerOptions.paths` (type-check) consume it so
// the two configurations cannot drift.
import { LOCAL_ALIASES, REPO_ROOT } from './scripts/lib/local-aliases.mjs';

// f00047 S6 — wire the shared package (`apps/shared/`) so the docs site
// can import `@mcp-vertex/shared`, `@mcp-vertex/shared/styles`, and
// `@mcp-vertex/shared/i18n` the same way every other consumer does.
// The site now uses the shared `<Dropdown>` and brand tokens; the site
// palette stays site-specific.
const SHARED_PUBLIC = resolve(REPO_ROOT, 'apps/shared/src/public/index.ts');
const SHARED_STYLES = resolve(REPO_ROOT, 'apps/shared/src/styles/_index.scss');
const SHARED_I18N = resolve(REPO_ROOT, 'apps/shared/src/i18n/index.ts');
const SHARED_COMPONENTS = resolve(REPO_ROOT, 'apps/shared/src/components');
// ORDER MATTERS: vite's alias matcher tries entries in insertion order and
// a bare `find` also prefix-matches `find + '/…'`, so the subpath aliases
// MUST precede the bare package alias or `@mcp-vertex/shared/i18n` resolves
// to `<public/index.ts>/i18n` → "Not a directory" at build time (astro
// check does not catch this; only the real `site`/`site:strict` build does).
// `components` is a DIRECTORY alias so `…/components/ui/code-block`
// resolves with vite's extension lookup (f00102 shared renderers).
const WORKSPACE_ALIASES = {
	// TS style modules under styles/ must precede the scss `styles` alias
	// (same shadowing rule): they are code, not sass.
	'@mcp-vertex/shared/styles/dashboard/dashboard-css': resolve(
		REPO_ROOT,
		'apps/shared/src/styles/dashboard/dashboard-css.ts',
	),
	'@mcp-vertex/shared/styles/dev-preview-css': resolve(
		REPO_ROOT,
		'apps/shared/src/styles/dev-preview-css.ts',
	),
	'@mcp-vertex/shared/styles': SHARED_STYLES,
	'@mcp-vertex/shared/i18n': SHARED_I18N,
	'@mcp-vertex/shared/components': SHARED_COMPONENTS,
	'@mcp-vertex/shared': SHARED_PUBLIC,
	// c00088: apps/shared deep-imports browser-safe client contracts
	// (`@mcp-vertex/client/lib/contracts/…`, since 0264f2a8). The client
	// package only exports `.` and `./public`, so the production astro
	// build cannot resolve the subpath through the exports map — alias
	// the lib subtree to the source. MUST precede any bare
	// `@mcp-vertex/client` alias if one is ever added (shadowing rule).
	'@mcp-vertex/client/lib': resolve(REPO_ROOT, 'packages/client/src/lib'),
};

// Static build for GitHub Pages (project site → served under /mcp-vertex/).
// Override the base with PAGES_BASE='' for a user/root deploy.
const base = process.env.PAGES_BASE ?? '/mcp-vertex';
// bumped: 2026-06-18 — force dev server to re-parse pages directory

export default defineConfig({
	site: 'https://cartagogit.github.io',
	base,
	// p126-monorepo-build-dist: Astro emits the static site to
	// `build/apps/web/` (monorepo-wide build layout). Consumers must look
	// there instead of the legacy `apps/web/dist/`. `outDir` is relative
	// to the Astro project root (apps/web/).
	outDir: '../../build/apps/web',
	cacheDir: '../../.cache/astro',
	build: { format: 'directory' },
	server: { port: 5000, host: true },
	i18n: {
		defaultLocale: 'en',
		locales: [
			'en',
			'es',
			'fr',
			'de',
			'pt',
			'it',
			'zh',
			'hi',
			'ar',
			'ja',
			'vi',
			'th',
		],
		routing: { prefixDefaultLocale: false },
	},
	vite: {
		// p112 s2: hand the `#MAYÚSCULAS/*` aliases to Vite. Vite does
		// NOT honour `tsconfig.json#paths` at runtime, so the runtime
		// config is required in addition to the type-check config in
		// `tsconfig.json`. The sync test prevents drift.
		resolve: {
			alias: { ...LOCAL_ALIASES, ...WORKSPACE_ALIASES },
		},
	},
});
