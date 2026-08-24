import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'project-health',
	package: '@mcp-vertex/project-health',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Compact project-health aggregator: cheap summary first, lazy domain details on demand.',
	tags: ['health', 'aggregation', 'f00166'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@mcp-vertex/core',
		'@mcp-vertex/quality',
		'@mcp-vertex/security',
		'@mcp-vertex/deps',
		'@mcp-vertex/tech-debt',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['health-aggregation'],
});
