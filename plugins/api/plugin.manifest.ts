import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'api',
	package: '@delendai/api',
	version: '0.2.4',
	visibility: 'public',
	summary: 'REST/GraphQL API surface for delendai plugins.',
	tags: ['api', 'surface'],
	maturity: 'stable',
	permissions: ['process', 'network'],
	presets: ['full'],
	tokenBudget: {
		staticBytes: 3_613,
		caps: { hard: 4_160, warning: 3_800 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@delendai/web-fetch'],
	capabilities: ['api', 'surface'],
});
