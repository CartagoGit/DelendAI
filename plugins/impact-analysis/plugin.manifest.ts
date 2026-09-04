import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'impact-analysis',
	package: '@delendai/impact-analysis',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Bounded impact analysis and test selection across changed symbols, dependents and related specs.',
	tags: ['impact', 'tests', 'f00169'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
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
