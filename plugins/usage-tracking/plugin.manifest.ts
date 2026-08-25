import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'usage-tracking',
	package: '@mcp-vertex/usage-tracking',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Per-token/per-call usage tracking (spend, budget).',
	tags: ['usage', 'spend'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['usage', 'spend'],
});
