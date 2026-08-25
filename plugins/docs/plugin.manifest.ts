import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'docs',
	package: '@mcp-vertex/docs',
	version: '0.1.1',
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
		'vertex',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['docs', 'catalog'],
});
