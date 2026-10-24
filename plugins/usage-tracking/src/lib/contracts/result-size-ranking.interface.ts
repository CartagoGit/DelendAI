/** One tool's results in the report window. */
export interface IToolResultSize {
	readonly plugin: string;
	readonly tool: string;
	readonly calls: number;
	readonly totalBytes: number;
	readonly largestBytes: number;
	/** Result size percentiles over the window's calls. */
	readonly p50Bytes: number;
	readonly p95Bytes: number;
	readonly p99Bytes: number;
}

export interface IResultSizeRanking {
	readonly byTotal: readonly IToolResultSize[];
	readonly byLargest: readonly IToolResultSize[];
}
