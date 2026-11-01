import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'auto-plugin-selector',
	package: '@delendai/auto-plugin-selector',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Recommends the best plugin set for this project from its signals (manifest, files, git, task).',
	tags: ['plugins', 'catalog', 'routing'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 3_726,
		caps: { hard: 4_290, warning: 3_920 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: [
		'@delendai/auto-agent-selector',
		'@delendai/core',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['plugins', 'catalog', 'routing'],
});
