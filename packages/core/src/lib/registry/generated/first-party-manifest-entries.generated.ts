import type { IPluginRegistryEntry } from '../../contracts/interfaces/plugin-registry.interface';

export const GENERATED_FIRST_PARTY_MANIFEST_ENTRIES: readonly IPluginRegistryEntry[] =
	[
		{
			origin: 'first-party',
			id: 'context-for-change',
			package: '@mcp-vertex/context-for-change',
			summary:
				'Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions.',
			tags: ['context', 'orchestration', 'compact', 'f00165'],
			permissions: ['filesystem-read'],
		},
		{
			origin: 'first-party',
			id: 'search',
			package: '@mcp-vertex/search',
			summary: 'Code search (semantic + symbol + references).',
			tags: ['search', 'symbol', 'f00136'],
			permissions: ['filesystem-read'],
		},
	];
