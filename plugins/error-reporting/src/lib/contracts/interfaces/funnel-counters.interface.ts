import type { FUNNEL_STAGES } from '../constants/funnel-stages.constant';
import type { SafeReporterFailureCode } from '../constants/safe-reporter-failure-codes.constant';

export type IFunnelStage = (typeof FUNNEL_STAGES)[number];

/**
 * Local, privacy-safe observability counters for the error-reporting
 * funnel (AUD-G01). Every field is a number, an ISO timestamp or an
 * enum code from this plugin's own vocabulary — never host-project
 * content — so this record needs no privacy validation of its own.
 */
export interface IFunnelCounters {
	readonly observedFailures: number;
	readonly ignoredNonFailures: number;
	readonly notVertexInternal: number;
	readonly privacyBlocked: number;
	readonly deduplicated: number;
	readonly rateLimited: number;
	readonly submissionAttempted: number;
	readonly submissionSucceeded: number;
	readonly submissionFailed: number;
	/** ISO timestamp of the last raw failure the hook observed. */
	readonly lastObservedAt?: string;
	/** ISO timestamp of the last failure that was safely classified. */
	readonly lastClassifiedAt?: string;
	/** ISO timestamp of the last network dispatch attempt. */
	readonly lastSubmittedAt?: string;
	/** Failure code from the most recent failed dispatch, if any. */
	readonly lastFailureCode?: SafeReporterFailureCode;
	/** Cooldown end while the circuit breaker is open, if any. */
	readonly circuitOpenUntil?: string;
}

export interface IFunnelCounterEvent {
	readonly stage: IFunnelStage;
	readonly at: string;
	/** Only meaningful for the `submissionFailed` stage. */
	readonly failureCode?: SafeReporterFailureCode | undefined;
	/** Only meaningful for the `submissionFailed` stage. */
	readonly circuitOpenUntil?: string | undefined;
}

export interface IFunnelCounterStore {
	readonly statePath: string;
	read(): Promise<IFunnelCounters>;
	/** Increments exactly one counter and refreshes its paired timestamp/code. */
	increment(event: IFunnelCounterEvent): Promise<void>;
	/** Stamps `lastClassifiedAt` without touching any counter. */
	markClassified(at: string): Promise<void>;
}
