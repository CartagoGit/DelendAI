import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'env',
	package: '@mcp-vertex/env',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Environment config validation (.env check + schema + env_explains).',
	tags: ['env', 'config'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'env-read'],
	presets: [
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
	capabilities: ['env', 'config'],
});
