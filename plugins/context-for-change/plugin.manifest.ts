import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'context-for-change',
	package: '@delendai/context-for-change',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions.',
	tags: ['context', 'orchestration', 'compact', 'f00165'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/core',
		'@delendai/git',
		'@delendai/search',
		'@delendai/memory',
		'@delendai/docs',
		'@delendai/conventions',
		'@delendai/refactor',
		'@delendai/test-policy',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['context-orchestration'],
});
