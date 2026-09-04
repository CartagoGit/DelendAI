import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'refactor',
	package: '@delendai/refactor',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Refactor primitives (symbols, definition, references, rename, codemod).',
	tags: ['refactor'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['standard', 'swarm', 'full', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', 'typescript'],
	capabilities: ['refactor'],
});
