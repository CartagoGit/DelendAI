import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'forge',
	package: '@mcp-vertex/forge',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Forge (GitHub/GitLab) wrappers — PRs, CI, issues.',
	tags: ['forge', 'git', 'ci'],
	maturity: 'stable',
	permissions: ['forge-read', 'forge-write', 'network'],
	presets: ['swarm', 'full', 'vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['forge', 'git', 'ci'],
});
