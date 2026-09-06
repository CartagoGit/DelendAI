import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'usage-tracking',
	package: '@delendai/usage-tracking',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Per-token/per-call usage tracking (spend, budget).',
	tags: ['usage', 'spend'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'network', 'env-read'],
	presets: ['dogfood'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['usage', 'spend'],
});
