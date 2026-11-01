import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'notification',
	package: '@delendai/notification',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Notification + lock-await primitives.',
	tags: ['notification', 'concurrency'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'full', 'dogfood'],
	tokenBudget: {
		staticBytes: 1_872,
		caps: { hard: 2_160, warning: 1_970 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['notification', 'concurrency'],
});
