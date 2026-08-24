export interface IErrorReportingOptions {
	readonly enabled: boolean;
	readonly targetRepo: string;
	readonly labels: readonly string[];
	readonly internalOnly: boolean;
	readonly dedupeWindowHours: number;
	readonly maxIssuesPerDay: number;
	readonly circuitBreakerThreshold: number;
	readonly backoffBaseMs: number;
	readonly backoffMaxMs: number;
	readonly backoffJitterRatio: number;
}
