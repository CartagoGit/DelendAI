import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'external-mcps',
	package: '@delendai/external-mcps',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Compose third-party MCP servers through the catalog + human ack.',
	tags: ['external-mcps', 'composition'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process', 'network', 'env-read'],
	presets: ['full'],
	tokenBudget: {
		staticBytes: 9_394,
		caps: { hard: 10_810, warning: 9_870 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', 'zod'],
	capabilities: ['external-mcps', 'composition'],
});
