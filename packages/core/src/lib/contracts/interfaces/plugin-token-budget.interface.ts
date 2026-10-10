/**
 * plugin-token-budget.interface.ts — f00179 S1: the real `tokenBudget`
 * shape for plugin manifests.
 *
 * `MAN-003` (P3, MEJORA) detected that `tokenBudget` in many
 * manifests was a placeholder copy of `TOKEN_BUDGETS.toolPayloads.search`,
 * so multiple plugins ended up reporting the same 2_700 / 3_000 bytes
 * regardless of their real tool surface. The new shape carries
 * MEASURED numbers, an ISO date stamp, and a provenance source so
 * drift can be detected.
 *
 * Backward compat: `tokenBudget: number` or the legacy
 * `ITokenBudgetCeiling` shape continue to be accepted — interpreted
 * as the new `staticBytes` (numeric form) or as the new `caps.hard`
 * + `staticBytes` (legacy ceiling form). See
 * `define-plugin-manifest.ts#PLUGIN_MANIFEST_SCHEMA` for the union.
 */
import type { ITokenBudgetCeiling } from '../constants/token-budgets.constant';

/** Hard ceiling + warning band for the plugin's tools/list footprint. */
export interface IPluginTokenBudgetCaps {
	/** Absolute ceiling; never superable. */
	readonly hard: number;
	/** Surface above which a warning is logged. */
	readonly warning: number;
}

/**
 * Per-plugin token budget with real semantics. Every field is the
 * measured, honest number; `measuredAt` + `source` make drift
 * detectable (a token-budget dashboard can compare today vs
 * `measuredAt` and refuse silently-stale values).
 */
export interface IPluginTokenBudget {
	/**
	 * Bytes of the cold-start `tools/list` payload for this plugin
	 * under the native / compact surface. The pre-f00179 placeholder
	 * (≈ 2_700..3_000) is replaced by the real measurement here.
	 */
	readonly staticBytes: number;
	/**
	 * Bytes the adaptive activation adds when ONE of this plugin's
	 * tools becomes accessible — marginal activation cost, not total.
	 * Hosts use this to weigh adaptive selection of large plugins.
	 */
	readonly adaptiveActivationBytes?: number | undefined;
	/**
	 * Typical p50 response bytes when this plugin's tools are
	 * invoked. Distinct from `staticBytes` (which is registration
	 * overhead, not invocation output).
	 */
	readonly typicalOutput?: number | undefined;
	/** Hard / warning band for this plugin's tools/list footprint. */
	readonly caps: IPluginTokenBudgetCaps;
	/** ISO date (YYYY-MM-DD) when these numbers were last measured. */
	readonly measuredAt: string;
	/**
	 * What produced the measurement. Stable tags:
	 *   - `token-budget-real` — measured by `run-actual-preset-budget`
	 *   - `token-budget-fallback` — derived from a sibling plugin's
	 *     measurement when a direct measurement is unavailable.
	 *   - `token-budget-estimated` — picked from the preset catalog
	 *     when no measurement is available.
	 */
	readonly source: string;
}

/**
 * Normalise a manifest's `tokenBudget` field (which can be either the
 * legacy `ITokenBudgetCeiling`, a bare number, or the new
 * `IPluginTokenBudget`) into the real shape. Numeric inputs become
 * `staticBytes`. Legacy ceiling inputs become `caps.hard` /
 * `caps.warning` with `staticBytes` set to `warning` (a conservative
 * pick that does NOT raise any hard budget).
 *
 * Pure: no I/O, no clock; the caller supplies `measuredAt` (typically
 * `new Date().toISOString().slice(0, 10)`).
 */
export const resolveTokenBudget = (
	raw: number | ITokenBudgetCeiling | IPluginTokenBudget,
	measuredAt: string,
): IPluginTokenBudget => {
	if (typeof raw === 'number') {
		return {
			staticBytes: raw,
			caps: { hard: raw, warning: raw },
			measuredAt,
			source: 'token-budget-fallback',
		};
	}
	// Distinguish legacy `{hard, warning, releaseRelativePercent}` from
	// the new `{staticBytes, caps, ...}` by presence of `staticBytes`.
	if (
		'staticBytes' in raw &&
		typeof (raw as IPluginTokenBudget).staticBytes === 'number'
	) {
		return raw as IPluginTokenBudget;
	}
	const ceiling = raw as ITokenBudgetCeiling;
	return {
		staticBytes: ceiling.warning,
		caps: { hard: ceiling.hard, warning: ceiling.warning },
		measuredAt,
		source: 'token-budget-fallback',
	};
};
