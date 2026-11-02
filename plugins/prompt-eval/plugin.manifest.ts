import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'prompt-eval',
	package: '@delendai/prompt-eval',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Prompt-eval harness (golden prompts, scoring).',
	tags: ['prompts', 'eval'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process'],
	presets: ['full'],
	tokenBudget: {
		staticBytes: 2_514,
		caps: { hard: 2_900, warning: 2_640 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: [
		'@delendai/auto-agent-selector',
		'@delendai/core',
		'@delendai/orchestrator-runner',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['prompts', 'eval'],
});
