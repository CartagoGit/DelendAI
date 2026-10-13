import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'test-convention',
	package: '@delendai/test-convention',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Test-file convention enforcement (spec path, mock style, forbidden patterns).',
	tags: ['tests', 'convention'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['swarm', 'full', 'dogfood', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['tests', 'convention'],
});
