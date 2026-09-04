import { toolJsonBounded, type IToolRegistration } from '@delendai/core/public';

import {
	FORGE_CI_STATUS_INPUT_SCHEMA,
	FORGE_CI_STATUS_OUTPUT_SCHEMA,
	FORGE_ISSUE_LIST_INPUT_SCHEMA,
	FORGE_ISSUE_LIST_OUTPUT_SCHEMA,
	FORGE_ISSUE_SHOW_INPUT_SCHEMA,
	FORGE_ISSUE_SHOW_OUTPUT_SCHEMA,
	FORGE_PR_LIST_INPUT_SCHEMA,
	FORGE_PR_LIST_OUTPUT_SCHEMA,
	FORGE_PR_SHOW_INPUT_SCHEMA,
	FORGE_PR_SHOW_OUTPUT_SCHEMA,
} from '../contracts/constants/forge-read.constant';
import type { IForgeExec } from '../contracts/interfaces/forge-read.interface';
import {
	getCiStatus,
	listIssues,
	listPullRequests,
	showIssue,
	showPullRequest,
} from '../services/forge';

export interface IForgeReadToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly forgeExec?: IForgeExec;
}

export interface IForgePrShowArgs {
	readonly pr?: string | number | undefined;
}

export interface IForgeCiStatusArgs {
	readonly limit?: number | undefined;
}

export interface IForgeIssueListArgs {
	readonly state?: 'open' | 'closed' | 'all' | undefined;
	readonly limit?: number | undefined;
}

export interface IForgeIssueShowArgs {
	readonly issue: string | number;
}

export const runForgePrList = async (options: IForgeReadToolOptions) =>
	toolJsonBounded(
		await listPullRequests(options.workspaceRootAbs, options.forgeExec),
	);

export const runForgePrShow = async (
	args: IForgePrShowArgs,
	options: IForgeReadToolOptions,
) =>
	toolJsonBounded(
		await showPullRequest(
			options.workspaceRootAbs,
			args.pr !== undefined ? String(args.pr) : undefined,
			options.forgeExec,
		),
	);

export const runForgeCiStatus = async (
	args: IForgeCiStatusArgs,
	options: IForgeReadToolOptions,
) =>
	toolJsonBounded(
		await getCiStatus(
			options.workspaceRootAbs,
			args.limit ?? 10,
			options.forgeExec,
		),
	);

export const runForgeIssueList = async (
	args: IForgeIssueListArgs,
	options: IForgeReadToolOptions,
) =>
	toolJsonBounded(
		await listIssues(
			options.workspaceRootAbs,
			args.state ?? 'open',
			args.limit ?? 50,
			options.forgeExec,
		),
	);

export const runForgeIssueShow = async (
	args: IForgeIssueShowArgs,
	options: IForgeReadToolOptions,
) =>
	toolJsonBounded(
		await showIssue(
			options.workspaceRootAbs,
			String(args.issue),
			options.forgeExec,
		),
	);

export const buildForgeReadToolRegistrations = (
	options: IForgeReadToolOptions,
): readonly IToolRegistration[] => [
	{
		id: 'pr_list',
		tags: ['forge', 'pull-request', 'network'],
		effects: ['network'],
		summary: 'List remote pull requests or merge requests with CI summary.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_pr_list`,
				{
					description:
						'List open pull requests or merge requests from the origin forge. Provider is auto-detected from the origin remote. Returns author, branch, draft, labels and a compact CI summary.',
					inputSchema: FORGE_PR_LIST_INPUT_SCHEMA,
					outputSchema: FORGE_PR_LIST_OUTPUT_SCHEMA,
				},
				async () => runForgePrList(options),
			);
		},
	},
	{
		id: 'pr_show',
		tags: ['forge', 'pull-request', 'network'],
		effects: ['network'],
		summary: 'Show one pull request or merge request with checks.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_pr_show`,
				{
					description:
						'Show one pull request or merge request from the origin forge. Includes review decision, mergeability and detailed checks.',
					inputSchema: FORGE_PR_SHOW_INPUT_SCHEMA,
					outputSchema: FORGE_PR_SHOW_OUTPUT_SCHEMA,
				},
				async (args: IForgePrShowArgs) => runForgePrShow(args, options),
			);
		},
	},
	{
		id: 'ci_status',
		tags: ['forge', 'ci', 'network'],
		effects: ['network'],
		summary: 'Show workflow or pipeline runs, jobs and failing logs.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_ci_status`,
				{
					description:
						'Show recent workflow or pipeline runs from the origin forge, including per-job status and failing-job logs when available.',
					inputSchema: FORGE_CI_STATUS_INPUT_SCHEMA,
					outputSchema: FORGE_CI_STATUS_OUTPUT_SCHEMA,
				},
				async (args: IForgeCiStatusArgs) =>
					runForgeCiStatus(args, options),
			);
		},
	},
	{
		id: 'issue_list',
		tags: ['forge', 'issues', 'network'],
		effects: ['network'],
		summary: 'List remote issues with state, labels and author.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_issue_list`,
				{
					description:
						'List issues from the origin forge. Returns state, labels and author; provider is auto-detected from the origin remote.',
					inputSchema: FORGE_ISSUE_LIST_INPUT_SCHEMA,
					outputSchema: FORGE_ISSUE_LIST_OUTPUT_SCHEMA,
				},
				async (args: IForgeIssueListArgs) =>
					runForgeIssueList(args, options),
			);
		},
	},
	{
		id: 'issue_show',
		tags: ['forge', 'issues', 'network'],
		effects: ['network'],
		summary: 'Show one remote issue with body and comments.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_issue_show`,
				{
					description:
						'Show one issue from the origin forge, including body, labels and comments.',
					inputSchema: FORGE_ISSUE_SHOW_INPUT_SCHEMA,
					outputSchema: FORGE_ISSUE_SHOW_OUTPUT_SCHEMA,
				},
				async (args: IForgeIssueShowArgs) =>
					runForgeIssueShow(args, options),
			);
		},
	},
];
