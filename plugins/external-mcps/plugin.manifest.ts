import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'external-mcps',
	package: '@delendai/external-mcps',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Compose third-party MCP servers through the catalog + human ack.',
	tags: ['external-mcps', 'composition'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process', 'network', 'env-read'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', 'zod'],
	capabilities: ['external-mcps', 'composition'],
});
