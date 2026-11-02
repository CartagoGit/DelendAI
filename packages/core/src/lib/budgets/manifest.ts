/**
 * manifest.ts — c00136 (Track E).
 *
 * Resolves the per-plugin `value` constant used by the token-ROI KPI.
 *
 * The ROI formula divides `successfulCalls × value` by the schema +
 * response cost. `value` is declared per plugin (arbitrary positive
 * units of "usefulness"); plugins without a declared value are excluded
 * from the report rather than ranked as 0.
 *
 * Plugins may declare `value` in their manifest object. Because the
 * core `IPluginManifest` type does not (yet) carry a `value` field,
 * this module reads it from the raw manifest record and normalises it
 * with the same strictness the ROI module expects (positive integer).
 *
 * Privacy (R1.1): only public plugin ids and their declared value are
 * read — no paths, emails or payload bytes.
 */
import type { IRoiUnranked } from '../contracts/interfaces/roi-report.interface';

export interface IPluginValueEntry {
	readonly pluginId: string;
	readonly value: number;
}

/** Parse a manifest record's `value` field into a positive integer. */
export const parsePluginValue = (raw: unknown): number | undefined => {
	if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
		return undefined;
	}
	return raw;
};

/**
 * Build an `IRoiValueLookup` from a list of (pluginId, rawValue)
 * pairs. Raw values that fail `parsePluginValue` are treated as
 * "no value declared" (excluded from ROI), never coerced to 0; `unranked`
 * names each such plugin and whether it declared nothing or a value the
 * rule refused, so a plugin left out of the ranking is a result, not a gap.
 */
export const buildValueLookup = (
	entries: readonly { pluginId: string; value: unknown }[],
): {
	valueFor: (pluginId: string) => number | undefined;
	readonly unranked: readonly IRoiUnranked[];
} => {
	const byId = new Map<string, number>();
	const unranked: IRoiUnranked[] = [];
	for (const entry of entries) {
		const parsed = parsePluginValue(entry.value);
		if (parsed === undefined) {
			unranked.push({
				pluginId: entry.pluginId,
				reason:
					entry.value === undefined
						? 'no-value-declared'
						: 'value-rejected',
			});
			continue;
		}
		byId.set(entry.pluginId, parsed);
	}
	return {
		valueFor: (pluginId) => byId.get(pluginId),
		unranked,
	};
};
