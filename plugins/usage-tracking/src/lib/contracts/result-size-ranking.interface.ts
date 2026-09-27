/** One tool's results in the report window. */
export interface IToolResultSize {
	readonly plugin: string;
	readonly tool: string;
	readonly calls: number;
	readonly totalBytes: number;
	readonly largestBytes: number;
}

export interface IResultSizeRanking {
	readonly byTotal: readonly IToolResultSize[];
	readonly byLargest: readonly IToolResultSize[];
}
