import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'auto-agent-selector',
	package: '@delendai/auto-agent-selector',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Zero-config multi-agent routing (cost↔quality dial, auto_recommend, escalation).',
	tags: ['routing', 'agents'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process', 'network', 'env-read'],
	presets: ['standard', 'swarm', 'full', 'dogfood'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['routing', 'agents'],
});
