/** r00024 (PRESET-001): the surface a measurement was taken under. Every
 * generated metadata entry and everything derived from it carries this so
 * a consumer (adoption assessment, the token dashboard) can tell which
 * surface its numbers describe instead of silently assuming one. */
export type IPresetSurfaceMode = 'native' | 'adaptive';

export interface IPresetBudgetMetric {
	readonly value: number;
	readonly source: 'measured-runtime';
	readonly measuredAt: string;
}

export interface IPresetTokenEstimate {
	readonly value: number;
	readonly source: 'estimated-from-schema-bytes';
	readonly measuredAt: string;
	readonly bytesPerEstimatedToken: number;
	/** r00024: which estimator produced this figure, e.g. a tokenizer
	 * model id or `bytes-per-token:<n>` for the heuristic divisor. */
	readonly estimator: string;
}

export interface IPresetBudgetStringList {
	readonly source: 'measured-tool-effects' | 'role-profile';
	readonly values: readonly string[];
}

export interface IPresetBudgetProfile {
	/** The surface used to capture the budget metrics. */
	readonly surfaceMode: IPresetSurfaceMode;
	/** The normal host surface these metrics are intended to describe. */
	readonly runtimeSurface: 'managed';
	readonly toolCount: IPresetBudgetMetric;
	readonly schemaBytes: IPresetBudgetMetric;
	readonly coldStartTokens: IPresetTokenEstimate;
	readonly permissions: IPresetBudgetStringList;
	readonly capabilities: IPresetBudgetStringList;
}

/**
 * r00024 (PRESET-001): fully generated from the same runtime measurement
 * the token dashboard uses (`tools/scripts/generate/preset-metadata.script.ts`
 * → `tools/scripts/report/token-budget-dashboard.script.ts`'s
 * `measurePresetDashboard`). No manually-kept tool counts. `role` is
 * deliberately NOT here — it is human policy, not a measurement, and
 * lives in `PRESET_ROLES` (`preset-roles.constant.ts`) instead.
 */
export interface IPresetMetadataEntry {
	/** The surface used to capture `budgetBaseline`, not the runtime default. */
	readonly measurementSurface: IPresetSurfaceMode;
	/** Normal host surface; separate from the full-surface measurement baseline. */
	readonly runtimeSurface?: 'managed';
	readonly source: 'generated-runtime-measurement';
	readonly measuredAt: string;
	readonly estimator: string;
	readonly bytesPerEstimatedToken: number;
	readonly budgetBaseline: {
		readonly toolCount: number;
		readonly schemaBytes: number;
		readonly coldStartTokens: number;
	};
}
