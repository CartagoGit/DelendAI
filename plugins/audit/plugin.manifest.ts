import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'audit',
	package: '@delendai/audit',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Multi-model audit planning + consolidation; f00139 adds self_audit dogfood loop.',
	tags: ['audit', 'multi-model', 'self-improvement'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'network', 'env-read'],
	presets: ['dogfood'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['audit', 'multi-model', 'self-improvement'],
});
