import type { SafeReporterFailureCode } from '../constants/safe-reporter-failure-codes.constant';

export interface IReportSchedulerClock {
	readonly nowMs: () => number;
	readonly random: () => number;
}

export interface IReportScheduleDecision {
	readonly action: 'submit' | 'skip';
	readonly reason:
		| 'existing-issue'
		| 'dedupe-window'
		| 'rate-limit'
		| 'backoff'
		| 'circuit-open';
	readonly failureCode?: SafeReporterFailureCode | undefined;
	readonly retryAt?: string | undefined;
}

export interface IReportFailureState {
	readonly failureCode: SafeReporterFailureCode;
	readonly consecutiveFailureCount: number;
	readonly nextEligibleAt: string;
	readonly circuitOpenUntil?: string | undefined;
}
