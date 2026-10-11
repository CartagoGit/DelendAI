import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'security',
	package: '@delendai/security',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Security audit (CVEs, SAST, secrets, env).',
	tags: ['security', 'audit'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'process', 'env-read'],
	presets: ['dogfood'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@delendai/core',
		'@delendai/deps',
		'@delendai/web-fetch',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['security', 'audit'],
});
