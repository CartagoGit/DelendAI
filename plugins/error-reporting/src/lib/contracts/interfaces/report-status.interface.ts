import type { IErrorReportingOptions } from './options.interface';
import type {
	IFunnelCounters,
	IFunnelCounterStore,
} from './funnel-counters.interface';
import type { IssueClassification } from './reporter.interface';
import type { IReportStore } from './report-store.interface';
import type { SafeReporterFailureCode } from '../constants/safe-reporter-failure-codes.constant';

export interface IReportStatusDestination {
	readonly targetRepo: string;
	readonly source: 'default';
	readonly allowlistedRepos: readonly string[];
	readonly transport: 'gh issue create';
	readonly forwardsProjectHeadersOrEnv: false;
}

export interface IReportStatusTransmittedFieldCatalog {
	readonly safeDtoFields: readonly string[];
	readonly issueBodyTableFields: readonly string[];
	readonly issueBodySectionFields: readonly string[];
	readonly excludedHostProjectFields: readonly string[];
}

export interface IReportStatusRecentReport {
	readonly fingerprint: string;
	readonly classification: IssueClassification;
	readonly attemptCount: number;
	readonly lastAttemptAt?: string | undefined;
	readonly lastSuccessAt?: string | undefined;
	readonly lastFailureCode?: string | undefined;
	readonly consecutiveFailureCount?: number | undefined;
	readonly circuitOpenUntil?: string | undefined;
	readonly issueNumber?: number | undefined;
	readonly issueUrl?: string | undefined;
}

/**
 * AUD-G01: the single-glance answer to "is error-reporting working?"
 * without opening `reported.json`. Derived from whichever record is
 * currently in the worst state (open circuit, else most consecutive
 * failures, else most recent dispatch) — never a per-record dump.
 */
export interface IReportStatusHealth {
	readonly lastFailureCode?: SafeReporterFailureCode | undefined;
	readonly consecutiveFailureCount: number;
	readonly circuitOpenUntil?: string | undefined;
	readonly circuitOpen: boolean;
	readonly lastAttemptAt?: string | undefined;
	readonly lastAttemptAgeMs?: number | undefined;
}

export interface IReportStatusOutput {
	readonly enabled: boolean;
	readonly labels: readonly string[];
	readonly destination: IReportStatusDestination;
	readonly classificationTaxonomy: readonly IssueClassification[];
	readonly transmittedFields: IReportStatusTransmittedFieldCatalog;
	readonly projectContextSent: false;
	readonly privacyStatement: string;
	readonly enableConfig: 'plugins.error-reporting.options.enabled = true';
	readonly health: IReportStatusHealth;
	readonly funnel: IFunnelCounters;
	readonly recentReports: readonly IReportStatusRecentReport[];
}

export interface IReportStatusToolOptions {
	readonly namespacePrefix: string;
	readonly options: IErrorReportingOptions;
	readonly store: IReportStore;
	readonly funnel?: Pick<IFunnelCounterStore, 'read'> | undefined;
}
