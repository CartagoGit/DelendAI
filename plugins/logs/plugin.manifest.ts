import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'logs',
	package: '@delendai/logs',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Structured logs reader (tail, query, redact).',
	tags: ['logs', 'observability'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'full', 'dogfood'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['logs', 'observability'],
});
