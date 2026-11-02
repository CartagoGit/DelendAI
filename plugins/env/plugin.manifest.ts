import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'env',
	package: '@delendai/env',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Environment config validation (.env check + schema + env_explains).',
	tags: ['env', 'config'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'env-read'],
	presets: [
		'standard',
		'swarm',
		'full',
		'dogfood',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	tokenBudget: {
		staticBytes: 3_480,
		caps: { hard: 4_010, warning: 3_660 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['env', 'config'],
});
