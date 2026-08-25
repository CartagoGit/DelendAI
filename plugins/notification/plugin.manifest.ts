import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'notification',
	package: '@mcp-vertex/notification',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Notification + lock-await primitives.',
	tags: ['notification', 'concurrency'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'full', 'vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['notification', 'concurrency'],
});
