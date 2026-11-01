import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'security',
	package: '@delendai/security',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Security audit (CVEs, SAST, secrets, env).',
	tags: ['security', 'audit'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write', 'process', 'env-read'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 5_697,
		caps: { hard: 6_560, warning: 5_990 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: [
		'@delendai/core',
		'@delendai/deps',
		'@delendai/web-fetch',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['security', 'audit'],
});
