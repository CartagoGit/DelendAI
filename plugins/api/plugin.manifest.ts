import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'api',
	package: '@delendai/api',
	version: '0.1.1',
	visibility: 'public',
	summary: 'REST/GraphQL API surface for mcp-vertex plugins.',
	tags: ['api', 'surface'],
	maturity: 'stable',
	permissions: ['process', 'network'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@delendai/web-fetch'],
	capabilities: ['api', 'surface'],
});
