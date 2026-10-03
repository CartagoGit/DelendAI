import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'test-policy',
	package: '@delendai/test-policy',
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
		'dogfood',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['tests', 'policy'],
});
