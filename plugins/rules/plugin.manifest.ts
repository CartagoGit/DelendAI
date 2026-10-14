import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'rules',
	package: '@delendai/rules',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Lint/type rules engine (frameworks, dogmas, presets).',
	tags: ['rules', 'lint'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'network', 'env-read'],
	presets: ['standard', 'swarm', 'full', 'dogfood', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['rules', 'lint'],
});
