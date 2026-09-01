import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'impact-analysis',
	package: '@mcp-vertex/impact-analysis',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Bounded impact analysis and test selection across changed symbols, dependents and related specs.',
	tags: ['impact', 'tests', 'f00169'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@mcp-vertex/core',
		'@mcp-vertex/git',
		'@mcp-vertex/search',
		'@mcp-vertex/refactor',
		'@mcp-vertex/test-policy',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['impact-analysis', 'test-selection'],
});
