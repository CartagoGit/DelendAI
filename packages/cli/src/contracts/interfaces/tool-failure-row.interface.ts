export interface IToolFailureCode {
	readonly class: string;
	readonly code: string;
	readonly count: number;
}

export interface IToolFailureRow {
	readonly tool: string;
	readonly calls: number;
	readonly failures: number;
	readonly failureShare: number;
	readonly topCodes: readonly IToolFailureCode[];
}
