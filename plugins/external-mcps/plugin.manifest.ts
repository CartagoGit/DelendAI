import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'external-mcps',
	package: '@mcp-vertex/external-mcps',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Compose third-party MCP servers through the catalog + human ack.',
	tags: ['external-mcps', 'composition'],
	maturity: 'stable',
	permissions: ['network', 'process'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', 'zod'],
	capabilities: ['external-mcps', 'composition'],
});
