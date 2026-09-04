import { definePluginManifest, TOKEN_BUDGETS } from '@delendai/core/public';

export default definePluginManifest({
	id: 'i18n',
	package: '@delendai/i18n',
	version: '0.1.1',
	visibility: 'public',
	summary: 'i18n key/interpolation validation across locale JSON files.',
	tags: ['i18n', 'l10n'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['standard', 'swarm', 'full', 'vertex', 'web-app'],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['i18n', 'l10n'],
});
