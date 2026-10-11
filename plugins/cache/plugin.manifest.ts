import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'cache',
	package: '@delendai/cache',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Cache-eviction rules and lifecycle for plugin scratch dirs.',
	tags: ['cache', 'lifecycle'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'env-read'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['cache', 'lifecycle'],
});
