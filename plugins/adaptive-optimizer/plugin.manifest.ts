import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'adaptive-optimizer',
	package: '@mcp-vertex/adaptive-optimizer',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Adaptive optimizer: cheaply rank model, plugin-set and prompt candidates with explicit budget and consent guards.',
	tags: ['optimizer', 'adaptive', 'prompt', 'f00168'],
	maturity: 'experimental',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@mcp-vertex/core',
		'@mcp-vertex/prompt-eval',
		'@mcp-vertex/usage-tracking',
		'@mcp-vertex/perf',
		'@mcp-vertex/auto-agent-selector',
		'@mcp-vertex/auto-plugin-selector',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['adaptive-optimization'],
});
