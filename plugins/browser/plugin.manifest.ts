import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'browser',
	package: '@mcp-vertex/browser',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Headless browser automation tools.',
	tags: ['browser', 'automation'],
	maturity: 'stable',
	permissions: ['filesystem-write', 'process', 'network', 'browser'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', 'playwright'],
	capabilities: ['browser', 'automation'],
});
