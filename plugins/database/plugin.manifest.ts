import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'database',
	package: '@mcp-vertex/database',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Database schema/introspection tools (read-only, offline).',
	tags: ['database', 'schema'],
	maturity: 'stable',
	permissions: ['database'],
	presets: ['standard', 'swarm', 'full', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', 'better-sqlite3', 'zod'],
	capabilities: ['database', 'schema'],
});
