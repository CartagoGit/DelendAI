import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'memory',
	package: '@delendai/memory',
	version: '0.1.1',
	visibility: 'public',
	summary: 'Persistent memory store (BM25 + recall, save, search).',
	tags: ['memory', 'persistence'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'filesystem-write'],
	presets: [
		'lean',
		'standard',
		'swarm',
		'full',
		'dogfood',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	// f00179 S2 — memory exposes 5 tools (save, recall, search,
	// forget, summarise). The store watcher + BM25 index add a
	// fixed 1.2 KB registration cost. Measured 2026-08-25.
	tokenBudget: {
		staticBytes: 4_500,
		adaptiveActivationBytes: 720,
		typicalOutput: 1_100,
		caps: { hard: 5_400, warning: 4_900 },
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: ['memory', 'persistence'],
});
