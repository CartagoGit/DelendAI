import type { IPluginRegistryEntry } from '../../contracts/interfaces/plugin-registry.interface';

export const GENERATED_FIRST_PARTY_MANIFEST_ENTRIES: readonly IPluginRegistryEntry[] =
	[
		{
			origin: 'first-party',
			id: 'search',
			package: '@mcp-vertex/search',
			summary: 'Code search (semantic + symbol + references).',
			tags: ['search', 'symbol', 'f00136'],
		},
	];
