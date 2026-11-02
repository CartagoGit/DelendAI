import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'quality-policy',
	package: '@delendai/quality-policy',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Unified quality-policy surface: cheap tests, conventions, lint, types and coverage guidance without running heavy quality commands.',
	tags: ['quality', 'policy', 'aggregation', 'f00167'],
	maturity: 'experimental',
	permissions: ['filesystem-read', 'filesystem-write', 'process'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 1_101,
		caps: { hard: 1_270, warning: 1_160 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
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
