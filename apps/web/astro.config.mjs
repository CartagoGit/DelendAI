// @ts-check
import { defineConfig } from 'astro/config';

// Static build for GitHub Pages (project site → served under /mcp-vertex/).
// Override the base with PAGES_BASE='' for a user/root deploy.
const base = process.env.PAGES_BASE ?? '/mcp-vertex';

export default defineConfig({
	site: 'https://cartagogit.github.io',
	base,
	build: { format: 'directory' },
	i18n: {
		defaultLocale: 'en',
		locales: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'hi', 'ar', 'ja', 'vi', 'th'],
		routing: { prefixDefaultLocale: false },
	},
});
