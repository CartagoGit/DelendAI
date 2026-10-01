import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'web-fetch',
	package: '@delendai/web-fetch',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Web fetch (allow-listed URLs only).',
	tags: ['web', 'fetch'],
	maturity: 'stable',
	permissions: ['network'],
	presets: ['full', 'web-app'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['web', 'fetch'],
});
