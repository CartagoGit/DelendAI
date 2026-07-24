import type {
	IForgeExec,
	IForgeFailure,
	IForgeSuccess,
} from './forge-read.interface';

export interface ICreatePrOptions {
	readonly title: string;
	readonly body?: string | undefined;
	readonly base?: string | undefined;
	readonly head?: string | undefined;
	readonly draft?: boolean | undefined;
	readonly confirm?: boolean | undefined;
	readonly proposalId?: string | undefined;
	readonly commits?: readonly string[] | undefined;
}

export interface ICommentPrOptions {
	readonly number: string | number;
	readonly body: string;
	readonly confirm?: boolean | undefined;
}

export interface ICreateIssueOptions {
	readonly title: string;
	readonly body?: string | undefined;
	readonly labels?: readonly string[] | undefined;
	readonly confirm?: boolean | undefined;
}

export interface IPrCreateResultData {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly body: string;
	readonly draft: boolean;
	readonly base?: string | undefined;
	readonly head?: string | undefined;
}

export interface IPrCommentResultData {
	readonly number: number;
	readonly body: string;
	readonly url?: string | undefined;
}

export interface IIssueCreateResultData {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly body: string;
	readonly labels: readonly string[];
}

export type IPrCreateResult =
	| IForgeSuccess<{ readonly pr: IPrCreateResultData }>
	| IForgeFailure;

export type IPrCommentResult =
	| IForgeSuccess<{ readonly comment: IPrCommentResultData }>
	| IForgeFailure;

export type IIssueCreateResult =
	| IForgeSuccess<{ readonly issue: IIssueCreateResultData }>
	| IForgeFailure;

export type IForgeWriteExec = IForgeExec;
