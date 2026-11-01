import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'completion',
	package: '@delendai/completion',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Task-completion notifier: records an agent declaring its original task done + reviewed and pushes a notification.',
	tags: ['completion', 'notification'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'full', 'dogfood'],
	tokenBudget: {
		staticBytes: 2_431,
		caps: { hard: 2_800, warning: 2_560 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['completion', 'notification'],
});
