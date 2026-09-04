import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'deps',
	package: '@delendai/deps',
	version: '0.1.1',
	visibility: 'public',
	summary:
		'Dependency inventory + offline health (deps_list, deps_check, deps_audit, deps_licenses, deps_tree).',
	tags: ['deps', 'licenses'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'network'],
	presets: ['standard', 'swarm', 'full', 'vertex', 'web-app', 'backend-api'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['deps', 'licenses'],
});
