import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'prompt-eval',
	package: '@delendai/prompt-eval',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Prompt-eval harness (golden prompts, scoring).',
	tags: ['prompts', 'eval'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/auto-agent-selector',
		'@delendai/core',
		'@delendai/orchestrator-runner',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['prompts', 'eval'],
});
