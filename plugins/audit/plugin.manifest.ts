import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'audit',
	package: '@mcp-vertex/audit',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Multi-model audit planning + consolidation; f00139 adds self_audit dogfood loop.',
	tags: ['audit', 'multi-model', 'self-improvement'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'network', 'env-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['audit', 'multi-model', 'self-improvement'],
});
