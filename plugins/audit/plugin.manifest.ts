import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'audit',
	package: '@delendai/audit',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Multi-model audit planning + consolidation; f00139 adds self_audit dogfood loop.',
	tags: ['audit', 'multi-model', 'self-improvement'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'network', 'env-read'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 11_568,
		caps: { hard: 13_310, warning: 12_150 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['audit', 'multi-model', 'self-improvement'],
});
