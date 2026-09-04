import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'database',
	package: '@delendai/database',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Database schema/introspection tools (read-only, offline).',
	tags: ['database', 'schema'],
	maturity: 'stable',
	permissions: ['env-read', 'database'],
	presets: ['standard', 'swarm', 'full', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', 'better-sqlite3', 'zod'],
	capabilities: ['database', 'schema'],
});
