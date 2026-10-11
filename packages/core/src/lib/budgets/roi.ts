/**
 * `Token ROI` per plugin — `c00136`.
 *
 * Computes a per-plugin ROI score that crosses token consumption with
 * declared plugin `value`, so consumers (notably `auto-plugin-selector`
 * via `f00196`) can rank plugins by efficiency, not just matching.
 *
 * Formula:
 *
 *   tokenROI = (successfulCalls × value) / (schemaBytes + responseTokens)
 *
 * `value` is declared in the plugin manifest; plugins without a value
 * are excluded from the report (they cannot be ranked).
 *
 * `confidence` is a sample-size bucket:
 *   - low      : successfulCalls < 10
 *   - medium   : 10 <= successfulCalls < 100
 *   - high     : successfulCalls >= 100
 *
 * All functions are pure. No fs, no network, no global state.
 */

export type IRoiConfidence = 'low' | 'medium' | 'high';

export interface IComputeRoiInput {
	readonly successfulCalls: number;
	readonly schemaBytes: number;
	readonly responseTokens: number;
	readonly value: number;
}

export interface IRoiReport {
	readonly pluginId: string;
	readonly roi: number;
	readonly sampleSize: number;
	readonly confidence: IRoiConfidence;
}

/**
 * Pure ROI computation. Zero calls or zero cost → ROI of 0 (no signal).
 * Negative numbers are clamped to 0 (a negative ROI is meaningless in
 * the value-per-byte framing the proposal uses).
 */
export const computeROI = (input: IComputeRoiInput): number => {
	if (input.successfulCalls <= 0) return 0;
	if (input.value <= 0) return 0;
	const denominator = input.schemaBytes + input.responseTokens;
	if (denominator <= 0) return 0;
	const raw = (input.successfulCalls * input.value) / denominator;
	return raw < 0 ? 0 : raw;
};

export const confidenceFor = (sampleSize: number): IRoiConfidence => {
	if (sampleSize < 10) return 'low';
	if (sampleSize < 100) return 'medium';
	return 'high';
};

/**
 * Aggregate per-plugin ROI from a flat list of measurements. Each
 * measurement carries a `pluginId`; the aggregator sums `successfulCalls`
 * and picks the largest `schemaBytes + responseTokens` observed for the
 * plugin (since the live budget is the most recent ceiling).
 *
 * Plugins whose `value` is missing (`undefined`) are skipped; we do
 * NOT inject `value=0` because that would always yield a 0 ROI and
 * pollute the report.
 */
export interface IRoiMeasurement {
	readonly pluginId: string;
	readonly successfulCalls: number;
	readonly schemaBytes: number;
	readonly responseTokens: number;
}

export interface IRoiValueLookup {
	/** Returns `undefined` when the plugin has no `value` declared. */
	valueFor: (pluginId: string) => number | undefined;
}

export const aggregateROI = (
	measurements: readonly IRoiMeasurement[],
	values: IRoiValueLookup,
): readonly IRoiReport[] => {
	const acc = new Map<
		string,
		{ calls: number; schema: number; tokens: number }
	>();
	for (const m of measurements) {
		const entry = acc.get(m.pluginId) ?? { calls: 0, schema: 0, tokens: 0 };
		entry.calls += m.successfulCalls;
		entry.schema = Math.max(entry.schema, m.schemaBytes);
		entry.tokens = Math.max(entry.tokens, m.responseTokens);
		acc.set(m.pluginId, entry);
	}
	const out: IRoiReport[] = [];
	for (const [pluginId, entry] of acc) {
		const value = values.valueFor(pluginId);
		if (value === undefined) continue;
		const roi = computeROI({
			successfulCalls: entry.calls,
			schemaBytes: entry.schema,
			responseTokens: entry.tokens,
			value,
		});
		out.push({
			pluginId,
			roi,
			sampleSize: entry.calls,
			confidence: confidenceFor(entry.calls),
		});
	}
	// Sort by ROI desc so consumers get top-first without re-sorting.
	out.sort((a, b) => b.roi - a.roi);
	return out;
};
