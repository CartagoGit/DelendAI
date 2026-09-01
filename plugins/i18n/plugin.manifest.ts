import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'i18n',
	package: '@mcp-vertex/i18n',
	version: '0.1.1',
	visibility: 'public',
	summary: 'i18n key/interpolation validation across locale JSON files.',
	tags: ['i18n', 'l10n'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['standard', 'swarm', 'full', 'vertex', 'web-app'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['i18n', 'l10n'],
});
