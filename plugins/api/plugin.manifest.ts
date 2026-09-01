import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'api',
	package: '@mcp-vertex/api',
	version: '0.1.1',
	visibility: 'public',
	summary: 'REST/GraphQL API surface for mcp-vertex plugins.',
	tags: ['api', 'surface'],
	maturity: 'stable',
	permissions: ['process', 'network'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@mcp-vertex/web-fetch'],
	capabilities: ['api', 'surface'],
});
