import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'github',
	package: '@mcp-vertex/github',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'GitHub read-only provider context, HTTP client and remote resource tools.',
	tags: ['github', 'provider'],
	maturity: 'experimental',
	permissions: ['filesystem-write', 'network', 'env-read'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@mcp-vertex/contracts', 'zod'],
	capabilities: ['github', 'remote-provider'],
});
