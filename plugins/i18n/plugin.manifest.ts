import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'i18n',
	package: '@delendai/i18n',
	version: '0.2.4',
	visibility: 'public',
	summary: 'i18n key/interpolation validation across locale JSON files.',
	tags: ['i18n', 'l10n'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['standard', 'swarm', 'full', 'dogfood', 'web-app'],
	tokenBudget: {
		staticBytes: 2_577,
		caps: { hard: 2_970, warning: 2_710 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['i18n', 'l10n'],
});
