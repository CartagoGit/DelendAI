import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'status-marker',
	package: '@mcp-vertex/status-marker',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Status marker + closure canonical line.',
	tags: ['status-marker', 'closure'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['swarm', 'full', 'vertex', 'web-app'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['status-marker', 'closure'],
});
