import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'remote-provider-core',
	package: '@delendai/remote-provider-core',
	version: '0.3.0',
	visibility: 'public',
	summary:
		'Shared remote-provider foundation: validated config, injectable HTTP, normalized errors.',
	tags: ['remote', 'provider', 'github', 'gitlab'],
	maturity: 'beta',
	permissions: ['filesystem-read'],
	presets: ['everything'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@delendai/contracts', 'zod'],
	capabilities: ['remote-provider'],
});
