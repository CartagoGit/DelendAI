import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'conventions',
	package: '@delendai/conventions',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Repo file-convention enforcement (interface, constant, service, tool …).',
	tags: ['conventions'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['swarm', 'full', 'dogfood'],
	tokenBudget: {
		staticBytes: 5_164,
		caps: { hard: 5_940, warning: 5_430 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['conventions'],
});
