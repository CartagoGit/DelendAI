import type { IMcpPlugin } from './plugin-contract';

/**
 * Pure, single-pass dependency check: for every plugin whose
 * `dependsOn` names a plugin id that is NOT also in the set, collect a
 * `{ plugin, missing }` entry. Order matches the input. Does not mutate
 * or import anything — a separate concern from the import/register loop
 * in `loadPlugins`, so it can be unit-tested and reasoned about on its
 * own (SOLID: one responsibility per function).
 *
 * @internal
 * Not part of the public API. Subject to change without notice.
 * Migrated to `*Internal` naming under b00238 (Track N / q00006 §50).
 */
export const checkPluginDependenciesInternal = (
	loadedPlugins: ReadonlyArray<{ readonly plugin: IMcpPlugin }>,
): readonly {
	readonly plugin: string;
	readonly missing: readonly string[];
}[] => {
	const loadedNames = new Set(
		loadedPlugins.map((entry) => entry.plugin.name),
	);
	const result: Array<{
		readonly plugin: string;
		readonly missing: readonly string[];
	}> = [];
	for (const { plugin } of loadedPlugins) {
		const missing = (plugin.dependsOn ?? []).filter(
			(dep) => !loadedNames.has(dep),
		);
		if (missing.length > 0) {
			result.push({ plugin: plugin.name, missing });
		}
	}
	return result;
};

/**
 * @deprecated Use `checkPluginDependenciesInternal` instead. Kept as a
 * thin re-export for one minor cycle so external callers can migrate.
 * Will be removed in the next minor release.
 */
export const checkPluginDependencies = checkPluginDependenciesInternal;

/** Render the combined dependency error for every plugin with missing deps. *
 *
 * @internal
 * Not part of the public API. Subject to change without notice.
 * Migrated to `*Internal` naming under b00238 (Track N / q00006 §50).
 */
export const formatMissingDependenciesErrorInternal = (
	missing: readonly {
		readonly plugin: string;
		readonly missing: readonly string[];
	}[],
): string =>
	missing
		.map(
			(entry) =>
				`plugin "${entry.plugin}" requires ${entry.missing
					.map((dep) => `"${dep}"`)
					.join(', ')} (not in load set)`,
		)
		.join('; ');

/**
 * @deprecated Use `formatMissingDependenciesErrorInternal` instead.
 * Kept as a thin re-export for one minor cycle.
 */
export const formatMissingDependenciesError =
	formatMissingDependenciesErrorInternal;
