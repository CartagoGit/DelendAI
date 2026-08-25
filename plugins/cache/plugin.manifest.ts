import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'cache',
	package: '@mcp-vertex/cache',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Cache-eviction rules and lifecycle for plugin scratch dirs.',
	tags: ['cache', 'lifecycle'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: [],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['cache', 'lifecycle'],
});
