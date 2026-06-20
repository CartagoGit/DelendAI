// @ts-check
import { defineConfig } from 'astro/config';

// Static build for GitHub Pages (project site → served under /mcp-vertex/).
// Override the base with PAGES_BASE='' for a user/root deploy.
const base = process.env.PAGES_BASE ?? '/mcp-vertex';
// bumped: 2026-06-18 — force dev server to re-parse pages directory

export default defineConfig({
	site: 'https://cartagogit.github.io',
	base,
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
});
