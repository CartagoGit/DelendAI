/**
 * first-party-index.ts — f00141 S1: the bundled first-party plugin
 * index. Plain data, no I/O; the resolver reads it as the default
 * source. Update this list when adding a new first-party plugin.
 */
import type { IPluginRegistrySource } from '../contracts/interfaces/plugin-registry.interface';

import { GENERATED_FIRST_PARTY_MANIFEST_ENTRIES } from './generated/first-party-manifest-entries.generated';

export const FIRST_PARTY_PLUGIN_INDEX: IPluginRegistrySource = {
	origin: 'first-party',
	entries: [...GENERATED_FIRST_PARTY_MANIFEST_ENTRIES],
};
