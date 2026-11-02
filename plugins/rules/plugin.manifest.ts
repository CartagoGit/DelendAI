import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'rules',
	package: '@delendai/rules',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Lint/type rules engine (frameworks, dogmas, presets).',
	tags: ['rules', 'lint'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'network', 'env-read'],
	presets: ['standard', 'swarm', 'full', 'dogfood', 'web-app', 'backend-api'],
	tokenBudget: {
		staticBytes: 5_634,
		caps: { hard: 6_480, warning: 5_920 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['rules', 'lint'],
});
