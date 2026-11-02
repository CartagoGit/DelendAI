import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'docs',
	package: '@delendai/docs',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Doc generation, search, and rendered catalog.',
	tags: ['docs', 'catalog'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: [
		'lean',
		'standard',
		'swarm',
		'full',
		'dogfood',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	tokenBudget: {
		staticBytes: 2_949,
		caps: { hard: 3_400, warning: 3_100 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['docs', 'catalog'],
});
