import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'perf',
	package: '@delendai/perf',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Performance bench/bundle/profile tools.',
	tags: ['perf', 'benchmark'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'process'],
	presets: ['dogfood', 'cli-tool'],
	tokenBudget: {
		staticBytes: 3_668,
		caps: { hard: 4_220, warning: 3_860 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['perf', 'benchmark'],
});
