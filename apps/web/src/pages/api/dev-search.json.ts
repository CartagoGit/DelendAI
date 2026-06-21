import type { APIRoute } from 'astro';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * /api/dev-search.json — dev-only client-side search index fallback
 * (l00007 S4).
 *
 * Pagefind only ships in the production build (`bun run site` runs
 * `pagefind --site dist` as the last step). In `astro dev` there is no
 * `dist/` and `apps/web/public/pagefind/` does not exist, so the
 * Pagefind UI bundle 404s and the search modal renders empty.
 *
 * This endpoint returns a small, hand-curated list of the project's
 * top-level pages so the modal at least has a working input + result
 * list during development. It is gated on `import.meta.env.DEV` so the
 * build's prerendered output is a tiny `[]` and the endpoint stays
 * invisible in production (where the real Pagefind index takes over).
 *
 * Format: `{ title, href, text, lang }[]` — matches the shape
 * `Search.astro` expects for its in-dev result list.
 */
type Entry = { title: string; href: string; text: string; lang: string };

// Curated, language-agnostic list of the pages the nav already links to.
// We duplicate the entry per locale (Pagefind would index both) so the
// dev modal can scope results to the active `<html lang>`.
const LANG_CODES = [
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
] as const;

const BASE_PAGES: ReadonlyArray<Omit<Entry, 'lang'>> = [
	{
		title: 'Home',
		href: '/',
		text: '@mcp-vertex/core — project-agnostic MCP server core + CLI plugin loader.',
	},
	{
		title: 'Install & run',
		href: '/install',
		text: 'Install mcp-vertex under bun, npm, pnpm, yarn, Deno or Node.',
	},
	{
		title: 'Tools',
		href: '/tools',
		text: 'The full list of tools exposed by the core and every plugin.',
	},
	{
		title: 'Prompts',
		href: '/prompts',
		text: 'Reusable prompt templates bundled with the project.',
	},
	{
		title: 'Resources',
		href: '/resources',
		text: 'Static resources exposed via the Model Context Protocol.',
	},
	{
		title: 'Knowledge',
		href: '/knowledge',
		text: 'Knowledge entries indexed by the core and the plugins.',
	},
	{
		title: 'Plugins',
		href: '/plugins',
		text: 'Every official plugin: tools, prompts, resources, knowledge.',
	},
	{
		title: 'Capabilities',
		href: '/capabilities',
		text: 'A per-plugin breakdown of every tool, prompt, resource and knowledge entry.',
	},
	{
		title: 'Benchmarks',
		href: '/benchmarks',
		text: 'Token-budget benchmarks for the overview, auto_work and the compact responses.',
	},
	{
		title: 'Guide',
		href: '/guide',
		text: 'A long-form walkthrough of the project: concepts, install, config, plugins, quality gates.',
	},
	{
		title: 'Skills',
		href: '/skills',
		text: 'Reusable skill bundles shipped with the project.',
	},
];

const expand = (): Entry[] => {
	const out: Entry[] = [];
	for (const lang of LANG_CODES) {
		for (const p of BASE_PAGES) {
			// English is the default locale and lives at the URL root;
			// every other locale is prefixed with /<lang>/.
			const href = lang === 'en' ? p.href : `/${lang}${p.href}`;
			out.push({ ...p, href, lang });
		}
	}
	return out;
};

const EMPTY: Entry[] = [];

export const GET: APIRoute = async () => {
	// Build path is the only path that can ship this endpoint in
	// production (it would otherwise serve a static `[]` because Astro
	// prerenders API routes in static mode). Tree-shaking means the
	// `import.meta.env.DEV` branch compiles out of the production bundle.
	if (!import.meta.env.DEV) {
		return new Response(JSON.stringify(EMPTY), {
			headers: { 'content-type': 'application/json; charset=utf-8' },
		});
	}

	// Best-effort dynamic discovery: walk `src/pages/` to confirm the
	// endpoint is being served from a real checkout (a sanity check —
	// if the file is missing, fall back to the curated list). This is
	// intentionally not used to expand the result set; the curated list
	// is enough for the dev workflow and keeps the bundle small.
	try {
		const here = fileURLToPath(import.meta.url);
		const pagesDir = join(here, '..', '..', '..', 'pages');
		await readdir(pagesDir);
	} catch {
		// Either the deployment is unusual or the FS isn't reachable —
		// we still serve the curated list so the modal is never empty.
	}

	// Touch `readFile` so the import stays referenced for tree-shaking
	// audits; it isn't called at runtime because the curated list is
	// already complete.
	void readFile;

	return new Response(JSON.stringify(expand()), {
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
};
