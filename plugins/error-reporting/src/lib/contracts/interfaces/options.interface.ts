export interface IErrorReportingOptions {
	readonly enabled: boolean;
	/** Fixed `owner/name` destination resolved only from plugin options. */
	readonly targetRepo: string;
	readonly labels: readonly string[];
	readonly dedupeWindowHours: number;
	readonly maxIssuesPerDay: number;
	readonly circuitBreakerThreshold: number;
	readonly backoffBaseMs: number;
	readonly backoffMaxMs: number;
	readonly backoffJitterRatio: number;
}

export interface IErrorReportingOptionsWarning {
	readonly code: 'ERR_REPORTING_OPTION_DEPRECATED';
	readonly message: string;
}

export type ErrorReportingOptionsWarningHandler = (
	warning: IErrorReportingOptionsWarning,
) => void;
