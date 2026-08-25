import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'diagram',
	package: '@mcp-vertex/diagram',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Diagram generator (mermaid, dot) from code structure.',
	tags: ['diagram', 'docs'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@mcp-vertex/core',
		'@mcp-vertex/database',
		'@mcp-vertex/proposals',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['diagram', 'docs'],
});
