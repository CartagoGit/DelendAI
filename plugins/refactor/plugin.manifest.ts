import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'refactor',
	package: '@mcp-vertex/refactor',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Refactor primitives (symbols, definition, references, rename, codemod).',
	tags: ['refactor'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['standard', 'swarm', 'full', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', 'typescript'],
	capabilities: ['refactor'],
});
