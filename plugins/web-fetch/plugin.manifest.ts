import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'web-fetch',
	package: '@mcp-vertex/web-fetch',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Web fetch (allow-listed URLs only).',
	tags: ['web', 'fetch'],
	maturity: 'stable',
	permissions: ['network'],
	presets: ['full', 'web-app'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['web', 'fetch'],
});
