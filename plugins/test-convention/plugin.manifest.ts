import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'test-convention',
	package: '@delendai/test-convention',
	version: '0.3.0',
	visibility: 'public',
	summary:
		'Test-file convention enforcement (spec path, mock style, forbidden patterns).',
	tags: ['tests', 'convention'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['team-pr', 'swarm', 'everything', 'dogfood'],
	tokenBudget: {
		staticBytes: 3_232,
		caps: { hard: 3_720, warning: 3_400 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['tests', 'convention'],
});
