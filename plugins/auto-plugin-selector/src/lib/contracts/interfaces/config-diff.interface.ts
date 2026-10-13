/**
 * config-diff.interface.ts — f00142 S2: the structured shape the
 * `plugins_recommend` tool returns so callers can preview an
 * evidence-backed config change before applying it.
 *
 * Pure data — no I/O, no fs, no subprocess. The apply step is
 * consent-gated and reuses `configuration_center`/`f00120`.
 */

import type { IPluginFit } from './plugin-fit.interface';

/**
 * One line of the diff. `kind` decides whether the user-facing
 * preview says "Add", "Remove", or "Keep".
 */
export interface IConfigDiffStep {
	readonly kind: 'add' | 'remove' | 'keep';
	readonly pluginId: string;
	/** Human-readable reason — the plugin-fit rationale or "already on". */
	readonly rationale: string;
	/** Optional — the source fit, when `kind` is 'add' or 'keep'. */
	readonly fit?: IPluginFit;
}

/**
 * Aggregated diff. `adds` / `removes` / `keeps` mirror `steps` but
 * are pre-filtered so the host doesn't have to re-walk the array.
 */
export interface IConfigDiff {
	readonly steps: readonly IConfigDiffStep[];
	readonly adds: readonly IConfigDiffStep[];
	readonly removes: readonly IConfigDiffStep[];
	readonly keeps: readonly IConfigDiffStep[];
}
