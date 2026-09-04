/**
 * Merge a generated delendai configuration into a consumer-owned one.
 *
 * Bootstrap recommendations are deliberately additive.  The consuming project
 * owns its configuration: its root values, plugin activation and plugin
 * options win whenever they are already present.  This keeps `init_config`
 * safe to run repeatedly while still letting a first bootstrap fill in a
 * complete, useful baseline.
 */
import type { IDelendaiConfigFile } from '../plugins/load-config-file';

type ConfigRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is ConfigRecord =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const cloneRecord = (value: ConfigRecord): ConfigRecord =>
	structuredClone(value);

const mergePluginEntry = (recommended: unknown, existing: unknown): unknown => {
	if (!isRecord(recommended) || !isRecord(existing)) return existing;
	const merged = { ...cloneRecord(recommended), ...cloneRecord(existing) };
	if (isRecord(recommended.options) && isRecord(existing.options)) {
		merged.options = {
			...cloneRecord(recommended.options),
			...cloneRecord(existing.options),
		};
	}
	return merged;
};

/**
 * Add any recommendation missing from `projectConfig` without changing an
 * existing project preference.  Plugin entries are merged one level deeper so
 * a generated default option is useful, while a project-provided option stays
 * authoritative.  Arrays and opaque nested settings are treated as atomic
 * project preferences and are never combined heuristically.
 */
export const mergeDerivedConfig = (
	recommended: Readonly<ConfigRecord>,
	projectConfig: Readonly<IDelendaiConfigFile | ConfigRecord>,
): ConfigRecord => {
	const merged: ConfigRecord = {
		...cloneRecord(recommended),
		...cloneRecord(projectConfig as ConfigRecord),
	};
	const recommendedPlugins = recommended.plugins;
	const projectPlugins = (projectConfig as ConfigRecord).plugins;
	if (!isRecord(recommendedPlugins) || !isRecord(projectPlugins))
		return merged;

	const plugins: ConfigRecord = cloneRecord(recommendedPlugins);
	for (const [pluginId, projectEntry] of Object.entries(projectPlugins)) {
		plugins[pluginId] = mergePluginEntry(
			recommendedPlugins[pluginId],
			projectEntry,
		);
	}
	merged.plugins = plugins;
	return merged;
};
