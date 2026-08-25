import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'git',
	package: '@mcp-vertex/git',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Git wrappers (PR list/view, diff, changelog, extended).',
	tags: ['git', 'changelog'],
	maturity: 'stable',
	permissions: ['git-read', 'git-write'],
	presets: [
		'minimal',
		'lean',
		'standard',
		'swarm',
		'full',
		'vertex',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['git', 'changelog'],
});
