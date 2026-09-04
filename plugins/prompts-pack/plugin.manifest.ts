import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'prompts-pack',
	package: '@delendai/prompts-pack',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Project-aware MCP prompts (explain-this-code, write-tests-for, review-this-diff, etc.).',
	tags: ['prompts'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['standard', 'swarm', 'full', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core'],
	capabilities: ['prompts'],
});
