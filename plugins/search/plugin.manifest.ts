import { definePluginManifest } from '@delendai/core/public';

export default definePluginManifest({
	id: 'search',
	package: '@delendai/search',
	version: '0.2.4',
	visibility: 'public',
	summary: 'Code search (semantic + symbol + references).',
	tags: ['search', 'symbol', 'f00136'],
	maturity: 'stable',
	permissions: ['filesystem-read', 'process', 'env-read'],
	presets: [
		'minimal',
		'lean',
		'standard',
		'swarm',
		'full',
		'dogfood',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	// f00179 S2 — search was the original placeholder value
	// (`TOKEN_BUDGETS.toolPayloads.search`). The real measured number
	// (semantic + lexical + regex + symbol + references) is below
	// the legacy `search.hard` ceiling. Measured 2026-08-25.
	tokenBudget: {
		staticBytes: 3_233,
		adaptiveActivationBytes: 480,
		typicalOutput: 800,
		caps: { hard: 3_720, warning: 3_400 },
		measuredAt: '2026-11-01',
		source: 'token-budget-real',
	},
	dependencies: ['@delendai/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: [
		'lexical-search',
		'regex-search',
		'semantic-search',
		'hybrid-search',
	],
});
