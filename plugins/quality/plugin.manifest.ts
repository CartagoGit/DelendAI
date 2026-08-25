import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'quality',
	package: '@mcp-vertex/quality',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Quality gates: coverage, complexity, lint, type-check orchestration.',
	tags: ['quality', 'gates'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process'],
	presets: ['standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['quality', 'gates'],
});
