import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'auto-plugin-selector',
	package: '@delendai/auto-plugin-selector',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Recommends the best plugin set for this project from its signals (manifest, files, git, task).',
	tags: ['plugins', 'catalog', 'routing'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/auto-agent-selector',
		'@delendai/core',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['plugins', 'catalog', 'routing'],
});
