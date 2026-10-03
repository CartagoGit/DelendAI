/** Minimal group-by-model payload from usage-tracking's `usage_report`. */
export interface IModelAttributionBucketPayload {
	readonly key: string;
	readonly calls: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly tokensSaved: number;
	readonly savingsPercent: number;
}

export interface IModelAttributionReportPayload {
	readonly groupBy: 'model';
	readonly totals: {
		readonly calls: number;
		readonly totalTokens: number;
		readonly costUsd: number;
		readonly tokensSaved: number;
		readonly savingsPercent: number;
	};
	readonly buckets: readonly IModelAttributionBucketPayload[];
}

export interface IModelAttributionRow {
	readonly key: string;
	readonly unattributed: boolean;
	readonly calls: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly tokensSaved: number;
	readonly savingsPercent: number;
	/** Width relative to the largest saving in this result, clamped 0..100. */
	readonly savingsBarPct: number;
}

export interface IModelAttributionReadyModel {
	readonly kind: 'ready';
	readonly empty: boolean;
	readonly totals: IModelAttributionReportPayload['totals'];
	readonly rows: readonly IModelAttributionRow[];
}

export interface IModelAttributionAbsentModel {
	readonly kind: 'plugin-absent';
	readonly plugin: 'usage-tracking';
	readonly hint: string;
	readonly configSnippet: string;
}

export type IModelAttributionModel =
	| IModelAttributionReadyModel
	| IModelAttributionAbsentModel;
