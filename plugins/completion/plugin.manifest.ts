import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'completion',
	package: '@mcp-vertex/completion',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Task-completion notifier: records an agent declaring its original task done + reviewed and pushes a notification.',
	tags: ['completion', 'notification'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'full', 'vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['completion', 'notification'],
});
