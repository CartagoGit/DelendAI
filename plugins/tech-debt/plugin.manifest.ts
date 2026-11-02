import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'tech-debt',
	package: '@delendai/tech-debt',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Tech-debt scanner (TODO/FIXME/HACK inventory).',
	tags: ['tech-debt'],
	maturity: 'stable',
	permissions: ['filesystem-read'],
	presets: ['dogfood'],
	tokenBudget: {
		staticBytes: 1_778,
		caps: { hard: 2_050, warning: 1_870 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['tech-debt'],
});
