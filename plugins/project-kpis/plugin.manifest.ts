import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'project-kpis',
	package: '@delendai/project-kpis',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Versioned project KPI snapshots and observability views across health, usage, economics and delivery.',
	tags: ['kpi', 'observability', 'economics', 'project-health'],
	maturity: 'experimental',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 4_093,
		caps: { hard: 4_710, warning: 4_300 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: [
		'@delendai/core',
		'@delendai/project-health',
		'@delendai/usage-tracking',
		'zod',
	],
	capabilities: ['project-kpis', 'observability', 'economics'],
});
