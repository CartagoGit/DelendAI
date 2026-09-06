import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'quality-policy',
	package: '@delendai/quality-policy',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Unified quality-policy surface: cheap tests, conventions, lint, types and coverage guidance without running heavy quality commands.',
	tags: ['quality', 'policy', 'aggregation', 'f00167'],
	maturity: 'experimental',
	permissions: ['filesystem-read', 'process'],
	presets: ['dogfood'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/core',
		'@delendai/quality',
		'@delendai/rules',
		'@delendai/test-policy',
		'@delendai/test-convention',
		'@delendai/conventions',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['quality-policy'],
});
