import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'observability',
	package: '@mcp-vertex/observability',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Observability surface (metrics, errors, telemetry).',
	tags: ['observability'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'network', 'env-read'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@mcp-vertex/web-fetch'],
	capabilities: ['observability'],
});
