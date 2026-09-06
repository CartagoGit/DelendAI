import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'status-marker',
	package: '@delendai/status-marker',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Status marker + closure canonical line.',
	tags: ['status-marker', 'closure'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['swarm', 'full', 'dogfood', 'web-app'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['status-marker', 'closure'],
});
