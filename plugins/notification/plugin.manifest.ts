import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'notification',
	package: '@delendai/notification',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Notification + lock-await primitives.',
	tags: ['notification', 'concurrency'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'full', 'dogfood'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['notification', 'concurrency'],
});
