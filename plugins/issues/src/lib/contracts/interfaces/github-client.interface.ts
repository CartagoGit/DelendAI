import type * as IGithubClientTypes from './github-client-types.interface';
/** Async argv-first process seam used by the GitHub client. */
export type ISpawn = (cmd: readonly string[]) => Promise<{
	readonly exitCode: number;
	readonly stdout: Uint8Array;
	readonly stderr: Uint8Array;
}>;

export interface IGithubClient {
	fetchIssue(number: number): Promise<IGithubClientTypes.IFetchIssueResult>;
	listIssues(
		opts?: IGithubClientTypes.IListIssuesOptions,
	): Promise<IGithubClientTypes.IListIssuesResult>;
	listDependabotAlerts(
		opts?: IGithubClientTypes.IListDependabotAlertsOptions,
	): Promise<IGithubClientTypes.IListDependabotAlertsResult>;
	listCodeScanningAlerts(
		opts?: IGithubClientTypes.IListCodeScanningAlertsOptions,
	): Promise<IGithubClientTypes.IListCodeScanningAlertsResult>;
	listSecretScanningAlerts(
		opts?: IGithubClientTypes.IListSecretScanningAlertsOptions,
	): Promise<IGithubClientTypes.IListSecretScanningAlertsResult>;
	listSecurityAdvisories(
		opts?: IGithubClientTypes.IListSecurityAdvisoriesOptions,
	): Promise<IGithubClientTypes.IListSecurityAdvisoriesResult>;
}
