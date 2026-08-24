export const GENERATED_PLUGIN_MANIFEST_WEB_CATALOG = [
	{
		id: 'search',
		package: '@mcp-vertex/search',
		summary: 'Code search (semantic + symbol + references).',
		tags: ['search', 'symbol', 'f00136'],
		maturity: 'stable',
		visibility: 'public',
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
		capabilities: [
			'lexical-search',
			'regex-search',
			'semantic-search',
			'hybrid-search',
		],
	},
] as const;
