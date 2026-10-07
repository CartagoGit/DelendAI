import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'gitlab',
	package: '@delendai/gitlab',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'GitLab read-only provider context, HTTP client and resource tools.',
	tags: ['gitlab', 'provider'],
	maturity: 'experimental',
	permissions: ['filesystem-write', 'network', 'env-read'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@delendai/contracts', 'zod'],
	capabilities: ['gitlab', 'remote-provider'],
});
