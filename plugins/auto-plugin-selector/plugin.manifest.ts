import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'auto-plugin-selector',
	package: '@mcp-vertex/auto-plugin-selector',
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
		'@mcp-vertex/auto-agent-selector',
		'@mcp-vertex/core',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['plugins', 'catalog', 'routing'],
});
