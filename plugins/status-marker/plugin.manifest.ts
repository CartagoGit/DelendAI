import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'status-marker',
	package: '@delendai/status-marker',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Status marker + closure canonical line.',
	tags: ['status-marker', 'closure'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['swarm', 'full', 'dogfood', 'web-app'],
	tokenBudget: {
		staticBytes: 2_043,
		caps: { hard: 2_350, warning: 2_150 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['status-marker', 'closure'],
});
