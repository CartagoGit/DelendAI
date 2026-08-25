import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'changelog',
	package: '@mcp-vertex/changelog',
	version: '0.1.1',
	visibility: 'private',
	summary: 'Conventional-commits changelog + release plan generator.',
	tags: ['changelog', 'release'],
	maturity: 'experimental',
	permissions: ['git-read'],
	presets: ['full', 'cli-tool'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', 'zod'],
	capabilities: ['changelog', 'release'],
});
