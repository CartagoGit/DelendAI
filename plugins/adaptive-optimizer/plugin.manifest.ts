import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'adaptive-optimizer',
	package: '@delendai/adaptive-optimizer',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Adaptive optimizer: cheaply rank model, plugin-set and prompt candidates with explicit budget and consent guards.',
	tags: ['optimizer', 'adaptive', 'prompt', 'f00168'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['dogfood'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/core',
		'@delendai/prompt-eval',
		'@delendai/usage-tracking',
		'@delendai/perf',
		'@delendai/auto-agent-selector',
		'@delendai/auto-plugin-selector',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['adaptive-optimization'],
});
