import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'error-reporting',
	package: '@mcp-vertex/error-reporting',
	version: '0.1.0',
	visibility: 'public',
	summary:
		'Automatic mcp-vertex error reporting: opens de-duplicated GitHub issues for internal failures (enabled by default).',
	tags: ['error-reporting', 'github', 'issues'],
	maturity: 'stable',
	permissions: ['network', 'forge-write'],
	presets: ['standard', 'swarm', 'full', 'vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['error-reporting', 'github', 'issues'],
});
