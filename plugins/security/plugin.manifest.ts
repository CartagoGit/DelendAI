import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'security',
	package: '@mcp-vertex/security',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Security audit (CVEs, SAST, secrets, env).',
	tags: ['security', 'audit'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'env-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: [
		'@mcp-vertex/core',
		'@mcp-vertex/deps',
		'@mcp-vertex/web-fetch',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['security', 'audit'],
});
