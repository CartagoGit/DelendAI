import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'prompt-eval',
	package: '@mcp-vertex/prompt-eval',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Prompt-eval harness (golden prompts, scoring).',
	tags: ['prompts', 'eval'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@mcp-vertex/auto-agent-selector',
		'@mcp-vertex/core',
		'@mcp-vertex/orchestrator-runner',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['prompts', 'eval'],
});
