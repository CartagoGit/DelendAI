import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'diagram',
	package: '@delendai/diagram',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Diagram generator (mermaid, dot) from code structure.',
	tags: ['diagram', 'docs'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: ['standard', 'swarm', 'full', 'dogfood', 'web-app', 'backend-api'],
	tokenBudget: {
		staticBytes: 3_277,
		caps: { hard: 3_770, warning: 3_450 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: [
		'@delendai/core',
		'@delendai/database',
		'@delendai/proposals',
		'@modelcontextprotocol/sdk',
		'zod',
	],
	capabilities: ['diagram', 'docs'],
});
