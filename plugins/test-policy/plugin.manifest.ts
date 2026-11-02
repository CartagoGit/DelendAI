import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'test-policy',
	package: '@delendai/test-policy',
	version: '0.2.4',
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
	tokenBudget: {
		staticBytes: 1_861,
		caps: { hard: 2_150, warning: 1_960 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['tests', 'policy'],
});
