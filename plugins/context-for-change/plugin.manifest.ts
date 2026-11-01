import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'context-for-change',
	package: '@delendai/context-for-change',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions.',
	tags: ['context', 'orchestration', 'compact', 'f00165'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 1_034,
		caps: { hard: 1_190, warning: 1_090 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
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
