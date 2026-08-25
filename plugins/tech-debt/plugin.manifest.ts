import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'tech-debt',
	package: '@mcp-vertex/tech-debt',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Tech-debt scanner (TODO/FIXME/HACK inventory).',
	tags: ['tech-debt'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['tech-debt'],
});
