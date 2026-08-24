import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'context-for-change',
	package: '@mcp-vertex/context-for-change',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions.',
	tags: ['context', 'orchestration', 'compact', 'f00165'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@mcp-vertex/core',
		'@mcp-vertex/git',
		'@mcp-vertex/search',
		'@mcp-vertex/memory',
		'@mcp-vertex/docs',
		'@mcp-vertex/conventions',
		'@mcp-vertex/refactor',
		'@mcp-vertex/test-policy',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['context-orchestration'],
});
