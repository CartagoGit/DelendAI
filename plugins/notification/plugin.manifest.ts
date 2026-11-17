import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'notification',
	package: '@delendai/notification',
	version: '0.3.0',
	visibility: 'public',
	summary: 'Notification + lock-await primitives.',
	tags: ['notification', 'concurrency'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'everything', 'dogfood'],
	tokenBudget: {
		// Re-measured when the forge event tools (subscribe, await) joined.
		staticBytes: 3_429,
		caps: { hard: 3_960, warning: 3_610 },
		measuredAt: '2026-11-11',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['notification', 'concurrency'],
});
