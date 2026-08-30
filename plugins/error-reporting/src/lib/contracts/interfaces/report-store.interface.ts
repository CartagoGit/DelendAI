import type { SafeReporterFailureCode } from '../constants/safe-reporter-failure-codes.constant';
import type { IssueClassification } from './reporter.interface';

/**
 * Durable de-duplication state. One JSON document maps
 * `fingerprint -> IReportRecord` so the same bug does not open a new
 * issue on every sighting — it is recorded once per window and future
 * sightings are suppressed until the window expires.
 */
export interface IReportRecord {
	readonly fingerprint: string;
	/** Canonical privacy-safe classification for this fingerprint. */
	readonly classification: IssueClassification;
	/** Total internal sightings recorded for this fingerprint. */
	readonly attemptCount: number;
	/** ISO timestamp of the last local sighting of this fingerprint. */
	readonly lastAttemptAt?: string;
	/** ISO timestamp of the last network dispatch attempt. */
	readonly lastDispatchAt?: string;
	/** ISO timestamp of the last successfully created issue. */
	readonly lastSuccessAt?: string;
	/** Last safe transport/scheduler failure classification, if any. */
	readonly lastFailureCode?: SafeReporterFailureCode;
	/** Consecutive failed dispatch attempts since the last success. */
	readonly consecutiveFailureCount: number;
	/** Earliest ISO timestamp at which another dispatch may be attempted. */
	readonly nextEligibleAt?: string;
	/** Expiring reservation held by the process currently dispatching. */
	readonly dispatchClaimedUntil?: string;
	/** Cooldown end while the circuit breaker is open. */
	readonly circuitOpenUntil?: string;
	/** GitHub issue number, present only when an issue was actually created. */
	readonly issueNumber?: number;
	/** Resolved issue URL, present only when an issue was created. */
	readonly issueUrl?: string;
}

export interface IReportAttemptInput {
	readonly at: string;
	readonly classification: IssueClassification;
}

export interface IReportFailureInput {
	readonly at: string;
	readonly failureCode: SafeReporterFailureCode;
	readonly nextEligibleAt: string;
	readonly circuitOpenUntil?: string | undefined;
}

export interface IReportSuccessInput {
	readonly at: string;
	readonly issueNumber: number;
	readonly issueUrl?: string | undefined;
}

export interface IReportStore {
	readonly statePath: string;
	get(fingerprint: string): Promise<IReportRecord | undefined>;
	recordAttempt(
		fingerprint: string,
		input: IReportAttemptInput,
	): Promise<void>;
	recordFailure(
		fingerprint: string,
		input: IReportFailureInput,
	): Promise<void>;
	recordSuccess(
		fingerprint: string,
		input: IReportSuccessInput,
	): Promise<void>;
	all(): Promise<readonly IReportRecord[]>;
	claimDispatch(
		fingerprint: string,
		claimedUntil: string,
		now: string,
	): Promise<boolean>;
}
