import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'search',
	package: '@mcp-vertex/search',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Code search (semantic + symbol + references).',
	tags: ['search', 'symbol', 'f00136'],
	maturity: 'stable',
	permissions: ['read-workspace'],
	presets: [
		'minimal',
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
	capabilities: [
		'lexical-search',
		'regex-search',
		'semantic-search',
		'hybrid-search',
	],
});
