/**
 * pack-presets.preset-list.ts — f00178: derived list of presets to smoke.
 *
 * Single source of truth: `PRESET_CATALOG` (`packages/core/src/lib/plugins/
 * preset-catalog.ts`). We MUST NOT hardcode the 9 distribuible presets
 * here — adding a new preset must automatically extend the smoke. The
 * filter `PUBLISH_ORDER`-aligns the catalog by dropping any preset whose
 * resolved members reference a package not in the publish order
 * (e.g. legacy `changelog` was removed in f00177 because it is private).
 *
 * The result is consumed by `tools/scripts/smoke/pack.script.ts` when
 * invoked with `--presets=<list>`, where `<list>` is the comma-separated
 * subset the user wants to run. An empty filter means "all derived
 * presets".
 */
import { PRESET_CATALOG, type IPresetKind } from '@mcp-vertex/core/public';
import { PUBLISH_ORDER } from '../release/release-plan.ts';

/** Path prefix every published plugin package lives under. */
const PLUGIN_DIR_PREFIX = 'plugins/';

/**
 * Every preset whose resolved members reference at least one package
 * NOT in `PUBLISH_ORDER` is dropped — the smoke can never install what
 * the release never publishes. Order is preserved (matches `PRESET_KIND`).
 */
export const deriveDistributablePresets = (): readonly IPresetKind[] => {
	const publishablePluginDirs = new Set(
		PUBLISH_ORDER.filter((dir) => dir.startsWith(PLUGIN_DIR_PREFIX)).map(
			(dir) => dir.slice(PLUGIN_DIR_PREFIX.length),
		),
	);
	return PRESET_CATALOG.map((preset) => preset.id).filter((presetId) => {
		const definition = PRESET_CATALOG.find((p) => p.id === presetId);
		if (definition === undefined) return false;
		// `independent: true` presets skip chain accumulation and resolve
		// only to their own `members`; chain presets accumulate every
		// preceding preset. Either way, we just verify each member is in
		// the publishable set.
		return definition.members.every((member) =>
			publishablePluginDirs.has(member.plugin),
		);
	});
};

/**
 * Parse the user-supplied `--presets=a,b,c` value. Whitespace trimmed,
 * empties dropped, unknown presets rejected. When the input is empty
 * the caller falls back to `deriveDistributablePresets()`.
 *
 * Exported separately so the spec can drive it without spinning up the
 * throwaway-project loop.
 */
export const parsePresetsArg = (
	raw: string | undefined,
): readonly IPresetKind[] => {
	if (raw === undefined) return [];
	const known = new Set(deriveDistributablePresets());
	return raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map((entry) => {
			if (!known.has(entry as IPresetKind)) {
				throw new Error(
					`pack smoke --presets: unknown preset "${entry}" (known: ${[...known].join(', ')})`,
				);
			}
			return entry as IPresetKind;
		});
};
