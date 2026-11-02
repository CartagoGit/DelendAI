import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'orchestrator-runner',
	package: '@delendai/orchestrator-runner',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Orchestrator-runner runtime utilities.',
	tags: ['orchestrator', 'runner'],
	maturity: 'stable',
	permissions: [
		'filesystem-read',
		'filesystem-write',
		'process',
		'network',
		'env-read',
	],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 36_062,
		caps: { hard: 41_480, warning: 37_870 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['orchestrator', 'runner'],
});
