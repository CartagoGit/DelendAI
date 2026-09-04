import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'project-health',
	package: '@delendai/project-health',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Compact project-health aggregator: cheap summary first, lazy domain details on demand.',
	tags: ['health', 'aggregation', 'f00166'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/core',
		'@delendai/quality',
		'@delendai/security',
		'@delendai/deps',
		'@delendai/tech-debt',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['health-aggregation'],
});
