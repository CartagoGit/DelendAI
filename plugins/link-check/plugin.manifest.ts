import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'link-check',
	package: '@delendai/link-check',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Markdown link checker.',
	tags: ['docs', 'links'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 1_722,
		caps: { hard: 1_990, warning: 1_810 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['docs', 'links'],
});
