import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'memory',
	package: '@mcp-vertex/memory',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Persistent memory store (BM25 + recall, save, search).',
	tags: ['memory', 'persistence'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: [
		'lean',
		'standard',
		'swarm',
		'full',
		'vertex',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['memory', 'persistence'],
});
