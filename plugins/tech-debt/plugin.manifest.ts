import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'tech-debt',
	package: '@delendai/tech-debt',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Tech-debt scanner (TODO/FIXME/HACK inventory).',
	tags: ['tech-debt'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['vertex'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['tech-debt'],
});
