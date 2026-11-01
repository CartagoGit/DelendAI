import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'observability',
	package: '@delendai/observability',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Observability surface (metrics, errors, telemetry).',
	tags: ['observability'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'network', 'env-read'],
	presets: ['full'],
	tokenBudget: {
		staticBytes: 5_734,
		caps: { hard: 6_600, warning: 6_030 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@delendai/web-fetch'],
	capabilities: ['observability'],
});
