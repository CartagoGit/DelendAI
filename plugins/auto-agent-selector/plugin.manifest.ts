import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'auto-agent-selector',
	package: '@mcp-vertex/auto-agent-selector',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Zero-config multi-agent routing (cost↔quality dial, auto_recommend, escalation).',
	tags: ['routing', 'agents'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process', 'network', 'env-read'],
	presets: ['standard', 'swarm', 'full', 'vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['routing', 'agents'],
});
