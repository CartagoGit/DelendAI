import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'remote-provider-core',
	package: '@mcp-vertex/remote-provider-core',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Shared remote-provider foundation: validated config, injectable HTTP, normalized errors.',
	tags: ['remote', 'provider', 'github', 'gitlab'],
	maturity: 'beta',
	permissions: ['filesystem-read'],
	presets: ['full'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@mcp-vertex/contracts', 'zod'],
	capabilities: ['remote-provider'],
});
