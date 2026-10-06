import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'completion',
	package: '@delendai/completion',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Task-completion notifier: records an agent declaring its original task done + reviewed and pushes a notification.',
	tags: ['completion', 'notification'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'full', 'dogfood'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['completion', 'notification'],
});
