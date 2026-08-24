import type { IErrorReportingOptions } from './options.interface';
import type { IssueClassification } from './reporter.interface';
import type { IReportStore } from './report-store.interface';

export interface IReportStatusDestination {
	readonly targetRepo: string;
	readonly source: 'default' | 'operator-configured';
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
	readonly issueNumber?: number | undefined;
	readonly issueUrl?: string | undefined;
}

export interface IReportStatusOutput {
	readonly enabled: boolean;
	readonly labels: readonly string[];
	readonly destination: IReportStatusDestination;
	readonly classificationTaxonomy: readonly IssueClassification[];
	readonly transmittedFields: IReportStatusTransmittedFieldCatalog;
	readonly projectContextSent: false;
	readonly privacyStatement: string;
	readonly disableConfig: 'plugins.error-reporting.options.enabled = false';
	readonly recentReports: readonly IReportStatusRecentReport[];
}

export interface IReportStatusToolOptions {
	readonly namespacePrefix: string;
	readonly options: IErrorReportingOptions;
	readonly store: IReportStore;
}
