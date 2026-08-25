import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'test-policy',
	package: '@mcp-vertex/test-policy',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Test policy mode (TDD, tests-after, free, none).',
	tags: ['tests', 'policy'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
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
	capabilities: ['tests', 'policy'],
});
