import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'project-kpis',
	package: '@delendai/project-kpis',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Versioned project KPI snapshots and observability views across health, usage, economics and delivery.',
	tags: ['kpi', 'observability', 'economics', 'project-health'],
	maturity: 'experimental',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/core',
		'@delendai/project-health',
		'@delendai/usage-tracking',
		'zod',
	],
	capabilities: ['project-kpis', 'observability', 'economics'],
});
