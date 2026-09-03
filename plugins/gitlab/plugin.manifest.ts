import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'gitlab',
	package: '@mcp-vertex/gitlab',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'GitLab read-only provider context, HTTP client and resource tools.',
	tags: ['gitlab', 'provider'],
	maturity: 'experimental',
	permissions: ['filesystem-write', 'network', 'env-read'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@mcp-vertex/contracts', 'zod'],
	capabilities: ['gitlab', 'remote-provider'],
});
