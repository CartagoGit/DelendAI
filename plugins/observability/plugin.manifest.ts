import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'observability',
	package: '@delendai/observability',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Observability surface (metrics, errors, telemetry).',
	tags: ['observability'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'network', 'env-read'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@delendai/web-fetch'],
	capabilities: ['observability'],
});
