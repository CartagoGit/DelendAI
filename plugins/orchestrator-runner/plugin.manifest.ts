import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'orchestrator-runner',
	package: '@mcp-vertex/orchestrator-runner',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Orchestrator-runner runtime utilities.',
	tags: ['orchestrator', 'runner'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process', 'network', 'env-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['orchestrator', 'runner'],
});
