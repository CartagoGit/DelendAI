import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'conventions',
	package: '@delendai/conventions',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Repo file-convention enforcement (interface, constant, service, tool …).',
	tags: ['conventions'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['swarm', 'full', 'vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['conventions'],
});
