import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'project-health',
	package: '@delendai/project-health',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Compact project-health aggregator: cheap summary first, lazy domain details on demand.',
	tags: ['health', 'aggregation', 'f00166'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 1_373,
		caps: { hard: 1_580, warning: 1_450 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
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
