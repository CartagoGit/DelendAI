import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'project-kpis',
	package: '@mcp-vertex/project-kpis',
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
		'@mcp-vertex/core',
		'@mcp-vertex/project-health',
		'@mcp-vertex/usage-tracking',
		'zod',
	],
	capabilities: ['project-kpis', 'observability', 'economics'],
});
