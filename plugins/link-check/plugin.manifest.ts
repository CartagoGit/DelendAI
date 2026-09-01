import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'link-check',
	package: '@mcp-vertex/link-check',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Markdown link checker.',
	tags: ['docs', 'links'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['docs', 'links'],
});
