export interface IErrorReportingOptions {
	readonly enabled: boolean;
	readonly targetRepo: string;
	readonly labels: readonly string[];
	readonly internalOnly: boolean;
	readonly dedupeWindowHours: number;
}
