import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'issues',
	package: '@mcp-vertex/issues',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Issue tracker adapters.',
	tags: ['issues'],
	maturity: 'stable',
	permissions: ['forge-read', 'forge-write', 'network'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['issues'],
});
