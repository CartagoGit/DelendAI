/**
 * config-diff.ts — f00142 S2: pure builder that maps the recommended
 * `IPluginFit[]` against the project's currently-loaded plugin ids
 * into a structured, consent-ready diff.
 *
 * Pure: same inputs -> same outputs. No fs, no subprocess. The caller
 * (the `plugins_recommend` tool, or the `init` flow) renders the diff
 * and reuses `configuration_center` / `f00120` to apply it after
 * consent.
 *
 * Algorithm:
 *   1. `keeps`     = plugins that appear in BOTH `current` and `recommendations`,
 *                     with their `IPluginFit` so the host can show
 *                     "why we kept this one";
 *   2. `adds`      = recommendations whose id is NOT in `current` (sorted by
 *                     `fitScore` desc, then id asc);
 *   3. `removes`   = plugins in `current` that have NO recommendation (sorted
 *                     by id asc);
 *   4. `steps`     = concatenation in `adds` → `removes` → `keeps` order so
 *                     the rendered preview groups by action.
 *
 * Stability: `limit` is already applied upstream by `recommendPlugins`, so
 * the recommendations reflect the final ranked set.
 */
import type { IPluginFit } from '../contracts/interfaces/plugin-fit.interface';
import type {
	IConfigDiff,
	IConfigDiffStep,
} from '../contracts/interfaces/config-diff.interface';

/**
 * Build the structured diff.
 *
 * @param current             Currently-loaded plugin ids (the host reads them
 *                            from `delendai.config.json` or a live preset).
 * @param recommendations     Output of `recommendPlugins(...)` for the same
 *                            project signals. May be empty.
 */
export const buildConfigDiff = (
	current: readonly string[],
	recommendations: readonly IPluginFit[],
): IConfigDiff => {
	const currentSet = new Set(current);
	const recById = new Map<string, IPluginFit>();
	for (const fit of recommendations) {
		recById.set(fit.plugin.id, fit);
	}

	const adds: IConfigDiffStep[] = [];
	const removes: IConfigDiffStep[] = [];
	const keeps: IConfigDiffStep[] = [];

	// Adds: recommended but not currently loaded. Recommendations are
	// de-duplicated by id (last fit wins), matching Map.set semantics; the
	// pure scorer never emits duplicates, but a caller might.
	const sortedRecs = [...recommendations].sort((a, b) => {
		if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
		return a.plugin.id.localeCompare(b.plugin.id);
	});
	const seenAdds = new Set<string>();
	for (const fit of sortedRecs) {
		if (currentSet.has(fit.plugin.id)) continue;
		if (seenAdds.has(fit.plugin.id)) continue;
		seenAdds.add(fit.plugin.id);
		const chosen = recById.get(fit.plugin.id) ?? fit;
		adds.push({
			kind: 'add',
			pluginId: chosen.plugin.id,
			rationale: formatReasons(chosen.reasons),
			fit: chosen,
		});
	}

	// Removes: currently loaded but not recommended at all.
	const recommendedIds = new Set(recById.keys());
	const sortedCurrent = [...current].sort((a, b) => a.localeCompare(b));
	for (const id of sortedCurrent) {
		if (!recommendedIds.has(id)) {
			removes.push({
				kind: 'remove',
				pluginId: id,
				rationale: 'no positive fit against project signals',
			});
		}
	}

	// Keeps: both currently loaded AND recommended.
	for (const id of sortedCurrent) {
		const fit = recById.get(id);
		if (fit !== undefined && currentSet.has(id)) {
			keeps.push({
				kind: 'keep',
				pluginId: id,
				rationale: formatReasons(fit.reasons),
				fit,
			});
		}
	}

	return {
		steps: [...adds, ...removes, ...keeps],
		adds,
		removes,
		keeps,
	};
};

const formatReasons = (reasons: readonly string[]): string => {
	if (reasons.length === 0) return 'no specific reason recorded';
	return reasons.join('; ');
};
