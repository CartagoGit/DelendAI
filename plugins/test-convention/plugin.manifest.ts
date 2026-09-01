import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'test-convention',
	package: '@mcp-vertex/test-convention',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Test-file convention enforcement (spec path, mock style, forbidden patterns).',
	tags: ['tests', 'convention'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['swarm', 'full', 'vertex', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['tests', 'convention'],
});
