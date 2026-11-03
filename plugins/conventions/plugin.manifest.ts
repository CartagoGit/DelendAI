import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'conventions',
	package: '@delendai/conventions',
	version: '0.3.0',
	visibility: 'public',
	summary:
		'Repo file-convention enforcement (interface, constant, service, tool …).',
	tags: ['conventions'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['team-pr', 'swarm', 'everything', 'dogfood'],
	tokenBudget: {
		staticBytes: 5_164,
		caps: { hard: 5_940, warning: 5_430 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['conventions'],
});
