import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'github',
	package: '@delendai/github',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'GitHub read-only provider context, HTTP client and remote resource tools.',
	tags: ['github', 'provider'],
	maturity: 'experimental',
	permissions: ['filesystem-write', 'network', 'env-read'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@delendai/contracts', 'zod'],
	capabilities: ['github', 'remote-provider'],
});
