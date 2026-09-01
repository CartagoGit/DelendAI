import type {
	IGithubComment,
	IGithubIssueDetail,
	IGithubIssueSummary,
} from '../issue.types';
import type { ISpawn } from './github-client.interface';
import type {
	ICodeScanningAlertSeverity,
	ICodeScanningAlertState,
	ICodeScanningAlertSummary,
	IDependabotAlertSeverity,
	IDependabotAlertState,
	IDependabotAlertSummary,
	ISecretScanningAlertState,
	ISecretScanningAlertSummary,
	ISecurityAdvisorySummary,
} from './security.interface';

export interface IIssueCreateInput {
	readonly title: string;
	readonly body: string;
	readonly labels?: readonly string[] | undefined;
}

export interface IIssueCreateResult {
	readonly issueNumber: number;
	readonly issueUrl: string;
}

export type IGithubClientTier = 'gh' | 'rest-authed' | 'rest-anon';

export interface IFetchIssueResult {
	readonly data: IGithubIssueDetail;
	readonly comments: readonly IGithubComment[];
	readonly tier: IGithubClientTier;
}

export interface IListIssuesOptions {
	readonly state?: 'open' | 'closed' | 'all';
	readonly labels?: readonly string[];
	readonly limit?: number;
}

export interface IListIssuesResult {
	readonly issues: readonly IGithubIssueSummary[];
	readonly tier: IGithubClientTier;
}

export type ISpawnSync = (cmd: readonly string[]) => {
	readonly exitCode: number;
	readonly stdout: Uint8Array;
	readonly stderr: Uint8Array;
};

export type IFetchFn = (
	url: string,
	init?: { readonly headers?: Record<string, string> },
) => Promise<{
	readonly ok: boolean;
	readonly status: number;
	json: () => Promise<unknown>;
}>;

export interface IGithubClientDeps {
	readonly spawn?: ISpawn;
	readonly spawnSync?: ISpawnSync;
	readonly fetchFn?: IFetchFn;
	readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface IListDependabotAlertsOptions {
	readonly state?: IDependabotAlertState;
	readonly severity?: IDependabotAlertSeverity;
	readonly limit?: number;
}

export interface IListDependabotAlertsResult {
	readonly alerts: readonly IDependabotAlertSummary[];
	readonly tier: IGithubClientTier;
}

export interface IListCodeScanningAlertsOptions {
	readonly state?: ICodeScanningAlertState;
	readonly severity?: ICodeScanningAlertSeverity;
	readonly limit?: number;
}

export interface IListCodeScanningAlertsResult {
	readonly alerts: readonly ICodeScanningAlertSummary[];
	readonly tier: IGithubClientTier;
}

export interface IListSecretScanningAlertsOptions {
	readonly state?: ISecretScanningAlertState;
	readonly limit?: number;
}

export interface IListSecretScanningAlertsResult {
	readonly alerts: readonly ISecretScanningAlertSummary[];
	readonly tier: IGithubClientTier;
}

export interface IListSecurityAdvisoriesOptions {
	readonly state?: string;
	readonly limit?: number;
}

export interface IListSecurityAdvisoriesResult {
	readonly advisories: readonly ISecurityAdvisorySummary[];
	readonly tier: IGithubClientTier;
}
