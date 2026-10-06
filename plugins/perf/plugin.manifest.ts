import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'perf',
	package: '@delendai/perf',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Performance bench/bundle/profile tools.',
	tags: ['perf', 'benchmark'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'process'],
	presets: ['dogfood', 'cli-tool'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['perf', 'benchmark'],
});
