import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'auto-agent-selector',
	package: '@delendai/auto-agent-selector',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Zero-config multi-agent routing (cost↔quality dial, auto_recommend, escalation).',
	tags: ['routing', 'agents'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process', 'network', 'env-read'],
	presets: ['standard', 'swarm', 'full', 'dogfood'],
	tokenBudget: {
		staticBytes: 6_881,
		caps: { hard: 7_920, warning: 7_230 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['routing', 'agents'],
});
