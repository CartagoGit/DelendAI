import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'search',
	package: '@mcp-vertex/search',
	version: '0.1.1',
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
		'vertex',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	// f00179 S2 — search was the original placeholder value
	// (`TOKEN_BUDGETS.toolPayloads.search`). The real measured number
	// (semantic + lexical + regex + symbol + references) is below
	// the legacy `search.hard` ceiling. Measured 2026-08-25.
	tokenBudget: {
		staticBytes: 2_700,
		adaptiveActivationBytes: 480,
		typicalOutput: 800,
		caps: {
			hard: TOKEN_BUDGETS.toolPayloads.search.hard,
			warning: TOKEN_BUDGETS.toolPayloads.search.warning,
		},
		measuredAt: '2026-08-25',
		source: 'token-budget-real',
	},
	dependencies: ['@mcp-vertex/core', '@modelcontextprotocol/sdk', 'zod'],
	capabilities: [
		'lexical-search',
		'regex-search',
		'semantic-search',
		'hybrid-search',
	],
});
