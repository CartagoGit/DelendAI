import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'logs',
	package: '@mcp-vertex/logs',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Structured logs reader (tail, query, redact).',
	tags: ['logs', 'observability'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'full', 'vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['logs', 'observability'],
});
