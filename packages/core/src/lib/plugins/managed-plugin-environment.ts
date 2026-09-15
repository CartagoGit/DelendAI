/**
 * managed-plugin-environment.ts — what a first-party plugin needs from the
 * environment, answered from the generated catalog instead of the plugin.
 *
 * `init` warns about missing environment variables. It used to learn which
 * ones matter by importing each enabled plugin and reading its options
 * schema: on the `dogfood` preset that was 37 runtime imports, 8.7 of the
 * command's 8.8 seconds, to produce an empty list (v00137). The catalog
 * generator reads the same schemas once, at generation time, so the
 * answer is already on disk.
 *
 * `undefined` is a distinct answer from `[]`: it means the plugin is not
 * in the catalog — a third-party plugin in an adopter's workspace — and
 * the caller must still ask the plugin itself. An empty list means it is
 * catalogued and needs nothing.
 */

import {
	MANAGED_LAZY_PLUGIN_BY_ID,
	type IManagedLazyPluginCatalogEntry,
} from './managed-lazy-catalog.generated';

export const managedPluginEnvironmentRequirements = (
	pluginId: string,
):
	| NonNullable<IManagedLazyPluginCatalogEntry['environmentRequirements']>
	| undefined => {
	const entry = MANAGED_LAZY_PLUGIN_BY_ID.get(pluginId);
	return entry === undefined
		? undefined
		: (entry.environmentRequirements ?? []);
};
