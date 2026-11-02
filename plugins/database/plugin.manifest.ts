import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'database',
	package: '@delendai/database',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Database schema/introspection tools (read-only, offline).',
	tags: ['database', 'schema'],
	maturity: 'stable',
	permissions: ['env-read', 'database'],
	presets: ['standard', 'swarm', 'full', 'backend-api'],
	tokenBudget: {
		staticBytes: 3_927,
		caps: { hard: 4_520, warning: 4_130 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', 'better-sqlite3', 'zod'],
	capabilities: ['database', 'schema'],
});
