import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'deps',
	package: '@delendai/deps',
	version: '0.2.4',
	visibility: 'public',
	summary:
		'Dependency inventory + offline health (deps_list, deps_check, deps_audit, deps_licenses, deps_tree).',
	tags: ['deps', 'licenses'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'network'],
	presets: ['standard', 'swarm', 'full', 'dogfood', 'web-app', 'backend-api'],
	tokenBudget: {
		staticBytes: 5_261,
		caps: { hard: 6_060, warning: 5_530 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['deps', 'licenses'],
});
