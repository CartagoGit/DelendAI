import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'cache',
	package: '@delendai/cache',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Cache-eviction rules and lifecycle for plugin scratch dirs.',
	tags: ['cache', 'lifecycle'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'env-read'],
	presets: ['full'],
	tokenBudget: {
		staticBytes: 2_057,
		caps: { hard: 2_370, warning: 2_160 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['cache', 'lifecycle'],
});
