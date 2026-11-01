import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'logs',
	package: '@delendai/logs',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Structured logs reader (tail, query, redact).',
	tags: ['logs', 'observability'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['swarm', 'full', 'dogfood'],
	tokenBudget: {
		staticBytes: 7_303,
		caps: { hard: 8_400, warning: 7_670 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['logs', 'observability'],
});
