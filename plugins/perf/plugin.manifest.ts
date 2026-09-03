import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'perf',
	package: '@mcp-vertex/perf',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Performance bench/bundle/profile tools.',
	tags: ['perf', 'benchmark'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'process'],
	presets: ['vertex', 'cli-tool'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['perf', 'benchmark'],
});
