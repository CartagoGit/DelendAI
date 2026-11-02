import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'impact-analysis',
	package: '@delendai/impact-analysis',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Bounded impact analysis and test selection across changed symbols, dependents and related specs.',
	tags: ['impact', 'tests', 'f00169'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 1_904,
		caps: { hard: 2_190, warning: 2_000 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: [
		'@delendai/core',
		'@delendai/git',
		'@delendai/search',
		'@delendai/refactor',
		'@delendai/test-policy',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['impact-analysis', 'test-selection'],
});
