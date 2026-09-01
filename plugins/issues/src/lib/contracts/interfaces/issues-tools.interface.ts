import type { IGithubClient } from './github-client.interface';
import type {
	ICodeScanningAlertSeverity,
	ICodeScanningAlertState,
	IDependabotAlertSeverity,
	IDependabotAlertState,
	ISecretScanningAlertState,
} from './security.interface';

export interface IListIssuesToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
}

export interface IListIssuesArgs {
	readonly state?: 'open' | 'closed' | 'all' | undefined;
	readonly labels?: readonly string[] | undefined;
	readonly limit?: number | undefined;
}

export interface IListDependabotToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
}

export interface IListDependabotArgs {
	readonly state?: IDependabotAlertState | undefined;
	readonly severity?: IDependabotAlertSeverity | undefined;
	readonly limit?: number | undefined;
}

export interface IListCodeScanningToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
}

export interface IListCodeScanningArgs {
	readonly state?: ICodeScanningAlertState | undefined;
	readonly severity?: ICodeScanningAlertSeverity | undefined;
	readonly limit?: number | undefined;
}

export interface IListSecretScanningToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
}

export interface IListSecretScanningArgs {
	readonly state?: Exclude<ISecretScanningAlertState, 'unknown'> | undefined;
	readonly limit?: number | undefined;
}

export interface IListAdvisoriesToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
}

export interface IListAdvisoriesArgs {
	readonly state?: string | undefined;
	readonly limit?: number | undefined;
}
