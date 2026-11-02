import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'web-fetch',
	package: '@delendai/web-fetch',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Web fetch (allow-listed URLs only).',
	tags: ['web', 'fetch'],
	maturity: 'stable',
	permissions: ['network'],
	presets: ['full', 'web-app'],
	tokenBudget: {
		staticBytes: 1_000,
		caps: { hard: 1_070, warning: 1_000 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['web', 'fetch'],
});
