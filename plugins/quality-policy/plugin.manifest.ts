import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'quality-policy',
	package: '@mcp-vertex/quality-policy',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Unified quality-policy surface: cheap tests, conventions, lint, types and coverage guidance without running heavy quality commands.',
	tags: ['quality', 'policy', 'aggregation', 'f00167'],
	maturity: 'experimental',
	permissions: ['filesystem-read', 'process'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@mcp-vertex/core',
		'@mcp-vertex/quality',
		'@mcp-vertex/rules',
		'@mcp-vertex/test-policy',
		'@mcp-vertex/test-convention',
		'@mcp-vertex/conventions',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['quality-policy'],
});
