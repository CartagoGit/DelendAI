import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'refactor',
	package: '@delendai/refactor',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Refactor primitives (symbols, definition, references, rename, codemod).',
	tags: ['refactor'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['standard', 'swarm', 'full', 'web-app', 'backend-api'],
	tokenBudget: {
		staticBytes: 6_270,
		caps: { hard: 7_220, warning: 6_590 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', 'typescript'],
	capabilities: ['refactor'],
});
