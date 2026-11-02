import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'usage-tracking',
	package: '@delendai/usage-tracking',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Per-token/per-call usage tracking (spend, budget).',
	tags: ['usage', 'spend'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'network', 'env-read'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 1_870,
		caps: { hard: 2_160, warning: 1_970 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['usage', 'spend'],
});
