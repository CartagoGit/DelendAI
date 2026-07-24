import type {
	IExternalTool,
	IExternalToolRun,
	IRunExternalToolInput,
} from '@mcp-vertex/core/public';

export type IForgeProvider = 'github' | 'gitlab';

export interface IForgeReadError {
	readonly reason: string;
	readonly remediation?: string;
}

export interface IForgeCiSummary {
	readonly total: number;
	readonly successful: number;
	readonly failed: number;
	readonly pending: number;
	readonly running: number;
}

export interface IMutableForgeCiSummary {
	total: number;
	successful: number;
	failed: number;
	pending: number;
	running: number;
}

export interface IForgePullRequestSummary {
	readonly number: number;
	readonly title: string;
	readonly branch: string;
	readonly url: string;
	readonly draft: boolean;
	readonly author: string;
	readonly labels: readonly string[];
	readonly ciSummary: IForgeCiSummary;
}

export interface IForgeCheck {
	readonly name: string;
	readonly status: string;
	readonly conclusion: string;
	readonly url: string;
}

export interface IForgePullRequestDetail extends IForgePullRequestSummary {
	readonly state: string;
	readonly mergeable: string;
	readonly reviewDecision: string;
	readonly checks: readonly IForgeCheck[];
}

export interface IForgeWorkflowJob {
	readonly id: string;
	readonly name: string;
	readonly status: string;
	readonly conclusion: string;
	readonly startedAt?: string;
	readonly completedAt?: string;
	readonly url?: string;
}

export interface IForgeWorkflowRun {
	readonly id: string;
	readonly name: string;
	readonly workflow: string;
	readonly branch: string;
	readonly status: string;
	readonly conclusion: string;
	readonly url: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
	readonly jobs: readonly IForgeWorkflowJob[];
	readonly failingLog?: string;
}

export interface IForgeIssueSummary {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly url: string;
	readonly author: string;
	readonly labels: readonly string[];
}

export interface IForgeIssueComment {
	readonly author: string;
	readonly body: string;
	readonly createdAt?: string;
	readonly url?: string;
}

export interface IForgeIssueDetail extends IForgeIssueSummary {
	readonly body: string;
	readonly comments: readonly IForgeIssueComment[];
}

export interface IForgeSuccess<T> {
	readonly ok: true;
	readonly provider: IForgeProvider;
	readonly data: T;
}

export interface IForgeFailure {
	readonly ok: false;
	readonly provider?: IForgeProvider;
	readonly error: IForgeReadError;
}

export type IForgePrListResult =
	| IForgeSuccess<{ readonly prs: readonly IForgePullRequestSummary[] }>
	| IForgeFailure;

export type IForgePrShowResult =
	| IForgeSuccess<{ readonly pr: IForgePullRequestDetail }>
	| IForgeFailure;

export type IForgeCiStatusResult =
	| IForgeSuccess<{ readonly runs: readonly IForgeWorkflowRun[] }>
	| IForgeFailure;

export type IForgeIssueListResult =
	| IForgeSuccess<{ readonly issues: readonly IForgeIssueSummary[] }>
	| IForgeFailure;

export type IForgeIssueShowResult =
	| IForgeSuccess<{ readonly issue: IForgeIssueDetail }>
	| IForgeFailure;

export type IForgeExec = (
	input: IRunExternalToolInput,
) => Promise<IExternalToolRun>;

export interface IForgeProviderInfo {
	readonly provider: IForgeProvider;
	readonly tool: IExternalTool;
	readonly remoteUrl: string;
	readonly remoteHost: string;
}

export type IForgeProviderResult =
	| ({ readonly ok: true } & IForgeProviderInfo)
	| IForgeFailure;

export interface IForgeCommands {
	readonly github: readonly string[];
	readonly gitlab: readonly string[];
}

export type IForgeRunResult =
	| {
			readonly ok: true;
			readonly provider: IForgeProvider;
			readonly tool: IExternalTool;
			readonly stdout: string;
			readonly stderr: string;
	  }
	| IForgeFailure;
