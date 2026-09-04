import {
	type IToolBreakdownRow,
	type IToolOwnerMetrics,
} from '../report/token-budget-report-lib';
export declare const TASK_CONTEXT_CORPUS: readonly [
	{
		readonly label: 'cold start';
		readonly route: null;
	},
	{
		readonly label: 'after search.search';
		readonly route: {
			readonly domain: 'search';
			readonly action: 'search';
			readonly args: {
				readonly query: 'proposal';
				readonly maxResults: 2;
				readonly context: 0;
			};
		};
	},
	{
		readonly label: 'after docs.docs_list';
		readonly route: {
			readonly domain: 'docs';
			readonly action: 'docs_list';
			readonly args: {
				readonly limit: 2;
			};
		};
	},
	{
		readonly label: 'after logs.tail';
		readonly route: {
			readonly domain: 'logs';
			readonly action: 'tail';
			readonly args: {
				readonly limit: 1;
				readonly kindFilter: 'token-budget-fixture-absent';
			};
		};
	},
];
export interface ITaskContextSample {
	readonly label: string;
	readonly bytes: number;
	readonly estimatedTokens: number;
}
export interface IBytePercentileSummary {
	readonly sampleCount: number;
	readonly p50Bytes: number;
	readonly p95Bytes: number;
	readonly p50EstimatedTokens: number;
	readonly p95EstimatedTokens: number;
}
export interface ICatalogPayloadMeasurement {
	readonly compactBytes: number;
	readonly compactEstimatedTokens: number;
	readonly fullBytes: number;
	readonly fullEstimatedTokens: number;
}
export interface ICatalogBreakdownMeasurement {
	readonly label: string;
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly estimatedTokens: number;
	readonly schemaBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly annotationsBytes: number;
	readonly otherFieldBytes: number;
	readonly envelopeBytes: number;
	readonly maxPluginBytes: number;
	readonly ownerRows: readonly IToolOwnerMetrics[];
	readonly topTools: readonly IToolBreakdownRow[];
}
export interface ITaskContextCostMeasurement extends IBytePercentileSummary {
	readonly presetId: 'swarm';
	readonly surfaceMode: 'managed';
	readonly route: 'core.project_context via vertex';
	readonly samples: readonly ITaskContextSample[];
}
export interface IMeasureCatalogAndTaskContextCostResult {
	readonly catalog: {
		readonly agentCatalog: ICatalogPayloadMeasurement;
		readonly nativeCore: ICatalogBreakdownMeasurement;
		readonly swarmNative: ICatalogBreakdownMeasurement;
	};
	readonly taskContext: ITaskContextCostMeasurement;
}
interface IToolResultLike {
	readonly structuredContent?: unknown;
	readonly content?: readonly {
		readonly type?: string;
		readonly text?: string;
	}[];
}
export declare const nearestRankPercentile: (
	values: readonly number[],
	percentile: number,
) => number;
export declare const summarizeBytePercentiles: (
	values: readonly number[],
) => IBytePercentileSummary;
export declare const measureToolResultPayloadBytes: (
	result: IToolResultLike,
) => number;
export declare const measureCatalogAndTaskContextCost: () => Promise<IMeasureCatalogAndTaskContextCostResult>;
export declare const renderCatalogAndTaskContextMarkdown: (
	measurement: IMeasureCatalogAndTaskContextCostResult,
) => string;
export {};
