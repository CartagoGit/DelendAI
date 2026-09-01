import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'rules',
	package: '@mcp-vertex/rules',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Lint/type rules engine (frameworks, dogmas, presets).',
	tags: ['rules', 'lint'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['rules', 'lint'],
});
