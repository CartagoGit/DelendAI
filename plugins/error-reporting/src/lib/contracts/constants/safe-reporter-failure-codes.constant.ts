export const SAFE_REPORTER_FAILURE_CODES = [
	'NETWORK_UNAVAILABLE',
	'GH_NOT_INSTALLED',
	'GH_EXEC_FAILED',
	'ISSUE_NUMBER_PARSE_FAILED',
	'RATE_LIMITED',
	'BACKOFF_ACTIVE',
	'CIRCUIT_OPEN',
] as const;

export type SafeReporterFailureCode =
	(typeof SAFE_REPORTER_FAILURE_CODES)[number];

export type SafeReporterTransportFailureCode = Extract<
	SafeReporterFailureCode,
	| 'NETWORK_UNAVAILABLE'
	| 'GH_NOT_INSTALLED'
	| 'GH_EXEC_FAILED'
	| 'ISSUE_NUMBER_PARSE_FAILED'
>;
