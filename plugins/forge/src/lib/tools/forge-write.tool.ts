import { readFile as fsReadFile } from 'node:fs/promises';

import { toolJsonBounded, type IToolRegistration } from '@delendai/core/public';

import {
	FORGE_ISSUE_CREATE_INPUT_SCHEMA,
	FORGE_ISSUE_CREATE_OUTPUT_SCHEMA,
	FORGE_DELENDAI_ISSUE_CREATE_INPUT_SCHEMA,
	FORGE_PR_COMMENT_INPUT_SCHEMA,
	FORGE_PR_COMMENT_OUTPUT_SCHEMA,
	FORGE_PR_CREATE_INPUT_SCHEMA,
	FORGE_PR_CREATE_OUTPUT_SCHEMA,
} from '../contracts/constants/forge-write.constant';
import type {
	ICommentPrOptions,
	ICreateIssueOptions,
	ICreateDelendaiIssueOptions,
	ICreatePrOptions,
	IForgeWriteExec,
} from '../contracts/interfaces/forge-write.interface';
import type { IProposalReadFile } from '../services/forge-write';
import {
	commentOnPr,
	createIssue,
	createDelendaiIssue,
	createPr,
} from '../services/forge-write';
import { REPOSITORY_SLUG } from '@delendai/core/public';

export interface IForgeWriteToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly forgeExec?: IForgeWriteExec;
	readonly proposalReadFile?: IProposalReadFile;
}

export const runForgePrCreate = async (
	args: ICreatePrOptions,
	options: IForgeWriteToolOptions,
) =>
	toolJsonBounded(
		await createPr(
			options.workspaceRootAbs,
			args,
			options.forgeExec,
			options.proposalReadFile ?? fsReadFile,
		),
	);

export const runForgePrComment = async (
	args: ICommentPrOptions,
	options: IForgeWriteToolOptions,
) =>
	toolJsonBounded(
		await commentOnPr(options.workspaceRootAbs, args, options.forgeExec),
	);

export const runForgeIssueCreate = async (
	args: ICreateIssueOptions,
	options: IForgeWriteToolOptions,
) =>
	toolJsonBounded(
		await createIssue(options.workspaceRootAbs, args, options.forgeExec),
	);

export const runForgeDelendaiIssueCreate = async (
	args: ICreateDelendaiIssueOptions,
	options: IForgeWriteToolOptions,
) =>
	toolJsonBounded(
		await createDelendaiIssue(
			options.workspaceRootAbs,
			args,
			options.forgeExec,
		),
	);

export const buildForgeWriteToolRegistrations = (
	options: IForgeWriteToolOptions,
): readonly IToolRegistration[] => [
	{
		id: 'pr_create',
		tags: ['forge', 'pull-request', 'network', 'write'],
		effects: ['write', 'network'],
		summary:
			'Create a pull request or merge request with explicit confirmation.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_pr_create`,
				{
					description:
						'Create a pull request or merge request on the origin forge. Requires confirm:true. The PR body is assembled from the provided description, an optional proposal markdown document and commit subjects from the base branch range.',
					inputSchema: FORGE_PR_CREATE_INPUT_SCHEMA,
					outputSchema: FORGE_PR_CREATE_OUTPUT_SCHEMA,
				},
				async (args: ICreatePrOptions) =>
					runForgePrCreate(args, options),
			);
		},
	},
	{
		id: 'pr_comment',
		tags: ['forge', 'pull-request', 'network', 'write'],
		effects: ['write', 'network'],
		summary:
			'Comment on a pull request or merge request with explicit confirmation.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_pr_comment`,
				{
					description:
						'Comment on a pull request or merge request on the origin forge. Requires confirm:true.',
					inputSchema: FORGE_PR_COMMENT_INPUT_SCHEMA,
					outputSchema: FORGE_PR_COMMENT_OUTPUT_SCHEMA,
				},
				async (args: ICommentPrOptions) =>
					runForgePrComment(args, options),
			);
		},
	},
	{
		id: 'issue_create',
		tags: ['forge', 'issues', 'network', 'write'],
		effects: ['write', 'network'],
		summary: 'Create a remote issue with explicit confirmation.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_issue_create`,
				{
					description:
						'Create an issue on the origin forge. Requires confirm:true.',
					inputSchema: FORGE_ISSUE_CREATE_INPUT_SCHEMA,
					outputSchema: FORGE_ISSUE_CREATE_OUTPUT_SCHEMA,
				},
				async (args: ICreateIssueOptions) =>
					runForgeIssueCreate(args, options),
			);
		},
	},
	{
		id: 'delendai_issue_create',
		tags: ['forge', 'issues', 'delendai', 'network', 'write'],
		effects: ['write', 'network'],
		summary:
			'Create an internal delendai issue in the canonical delendai repository.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_delendai_issue_create`,
				{
					description: `Create an issue for an delendai error or defect in ${REPOSITORY_SLUG}. This destination is fixed and does not use the consuming project origin. Requires confirm:true.`,
					inputSchema: FORGE_DELENDAI_ISSUE_CREATE_INPUT_SCHEMA,
					outputSchema: FORGE_ISSUE_CREATE_OUTPUT_SCHEMA,
				},
				async (args: ICreateDelendaiIssueOptions) =>
					runForgeDelendaiIssueCreate(args, options),
			);
		},
	},
];
