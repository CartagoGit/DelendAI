import { z } from 'zod';

import { toolJson, type IToolRegistration } from '@mcp-vertex/core/public';

import {
	buildCiJobsCommand,
	buildCiRunsCommand,
	buildIssueListCommand,
	buildIssueShowCommand,
	buildPrListCommand,
	buildPrShowCommand,
} from '../cli/cli';
import { detectForgeProvider, type IForgeProvider } from '../detect';
import {
	MissingCliError,
	runGh,
	runGlab,
	type IForgeExecOptions,
	type IForgeExecResult,
} from '../exec';
import { parseCiStatus, type IForgeCiStatus } from '../parsers/ci-status';
import {
	parseIssueList,
	type IForgeIssueListEntry,
} from '../parsers/issue-list';
import { parseIssueShow, type IForgeIssueShow } from '../parsers/issue-show';
import { parsePrList, type IForgePrListEntry } from '../parsers/pr-list';
import { parsePrShow, type IForgePrShow } from '../parsers/pr-show';

export type IForgeReadKind =
	| 'pr_list'
	| 'pr_show'
	| 'ci_status'
	| 'issue_list'
	| 'issue_show';

export interface IForgeReadBaseParams {
	readonly cwd?: string | undefined;
	readonly timeoutMs?: number | undefined;
	readonly limit?: number | undefined;
	readonly state?: 'open' | 'closed' | 'all' | undefined;
	readonly headSha?: string | undefined;
	readonly failingJobsOnly?: boolean | undefined;
	readonly number?: number | undefined;
}

export type IForgeReadInput =
	| ({ readonly kind: 'pr_list' } & IForgeReadBaseParams)
	| ({
			readonly kind: 'pr_show';
			readonly number: number;
	  } & IForgeReadBaseParams)
	| ({ readonly kind: 'ci_status' } & IForgeReadBaseParams)
	| ({ readonly kind: 'issue_list' } & IForgeReadBaseParams)
	| ({
			readonly kind: 'issue_show';
			readonly number: number;
	  } & IForgeReadBaseParams);

export interface IForgeReadToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly defaultTimeoutMs?: number;
	readonly detectProvider?: (cwd: string) => Promise<IForgeProvider>;
	readonly runGh?: (
		args: readonly string[],
		options?: IForgeExecOptions,
	) => Promise<IForgeExecResult>;
	readonly runGlab?: (
		args: readonly string[],
		options?: IForgeExecOptions,
	) => Promise<IForgeExecResult>;
}

type IForgeListResponse<T> = {
	readonly ok: boolean;
	readonly provider: IForgeProvider;
	readonly items?: readonly T[];
	readonly error?: string;
	readonly hint?: string;
};

type IForgeItemResponse<T> = {
	readonly ok: boolean;
	readonly provider: IForgeProvider;
	readonly pr?: T;
	readonly issue?: T;
	readonly status?: IForgeCiStatus;
	readonly error?: string;
	readonly hint?: string;
};

const ProviderSchema = z.enum(['github', 'gitlab', 'unknown']);
const LabelSchema = z.array(z.string());
const PrListItemSchema = z.object({
	number: z.number(),
	title: z.string(),
	author: z.string(),
	branch: z.string(),
	base: z.string(),
	url: z.string(),
	state: z.string(),
	draft: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
	labels: LabelSchema,
});
const PrShowSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string(),
	author: z.string(),
	branch: z.string(),
	base: z.string(),
	state: z.string(),
	url: z.string(),
	additions: z.number(),
	deletions: z.number(),
	changedFiles: z.number(),
	reviewStatus: z.string(),
	commits: z.array(
		z.object({
			sha: z.string(),
			message: z.string(),
			author: z.string(),
			authoredAt: z.string(),
		}),
	),
	comments: z.number(),
	checks: z.array(
		z.object({
			name: z.string(),
			status: z.string(),
			conclusion: z.string(),
			url: z.string(),
		}),
	),
	labels: LabelSchema,
});
const CiStatusSchema = z.object({
	sha: z.string(),
	runs: z.array(
		z.object({
			name: z.string(),
			status: z.string(),
			conclusion: z.string(),
			url: z.string(),
			startedAt: z.string(),
			finishedAt: z.string(),
			jobs: z.array(
				z.object({
					name: z.string(),
					status: z.string(),
					conclusion: z.string(),
					logUrl: z.string(),
				}),
			),
		}),
	),
});
const IssueListItemSchema = z.object({
	number: z.number(),
	title: z.string(),
	state: z.string(),
	author: z.string(),
	labels: LabelSchema,
	url: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
const IssueShowSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string(),
	state: z.string(),
	author: z.string(),
	labels: LabelSchema,
	comments: z.array(
		z.object({
			author: z.string(),
			body: z.string(),
			createdAt: z.string(),
			url: z.string(),
		}),
	),
	url: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

const buildListOutputSchema = <T extends z.ZodTypeAny>(item: T) =>
	z.object({
		ok: z.boolean(),
		provider: ProviderSchema,
		items: z.array(item).optional(),
		error: z.string().optional(),
		hint: z.string().optional(),
	});

const buildObjectOutputSchema = <
	K extends 'pr' | 'issue' | 'status',
	T extends z.ZodTypeAny,
>(
	key: K,
	schema: T,
) =>
	z.object({
		ok: z.boolean(),
		provider: ProviderSchema,
		[key]: schema.optional(),
		error: z.string().optional(),
		hint: z.string().optional(),
	}) as unknown as z.ZodObject<
		Record<K | 'ok' | 'provider' | 'error' | 'hint', z.ZodTypeAny>
	>;

const parseJsonText = (text: string): unknown => JSON.parse(text);

const runProviderCommand = async (
	provider: IForgeProvider,
	command: readonly string[],
	options: IForgeReadToolOptions,
	execOptions: IForgeExecOptions,
): Promise<IForgeExecResult> => {
	if (provider === 'gitlab') {
		return (options.runGlab ?? runGlab)(command.slice(1), execOptions);
	}
	return (options.runGh ?? runGh)(command.slice(1), execOptions);
};

const unknownProviderResponse = <T>(): IForgeListResponse<T> => ({
	ok: false,
	provider: 'unknown',
	error: 'Could not detect forge provider from the origin remote.',
	hint: 'Point origin at github.com or gitlab.com, then retry.',
});

export const createForgeReadRunner = (options: IForgeReadToolOptions) => {
	const detectProvider = options.detectProvider ?? detectForgeProvider;
	return async (
		input: IForgeReadInput,
	): Promise<
		| IForgeListResponse<IForgePrListEntry>
		| IForgeListResponse<IForgeIssueListEntry>
		| IForgeItemResponse<IForgePrShow>
		| IForgeItemResponse<IForgeIssueShow>
		| IForgeItemResponse<IForgeCiStatus>
	> => {
		const cwd = input.cwd ?? options.workspaceRootAbs;
		const provider = await detectProvider(cwd);
		if (provider === 'unknown') {
			return unknownProviderResponse();
		}
		const execOptions: IForgeExecOptions = {
			cwd,
			...((input.timeoutMs ?? options.defaultTimeoutMs) !== undefined
				? { timeoutMs: input.timeoutMs ?? options.defaultTimeoutMs }
				: {}),
		};
		try {
			switch (input.kind) {
				case 'pr_list': {
					const result = await runProviderCommand(
						provider,
						buildPrListCommand(provider, {
							limit: input.limit,
							state: input.state,
						}),
						options,
						execOptions,
					);
					return {
						ok: true,
						provider,
						items: parsePrList(result.stdout),
					};
				}
				case 'pr_show': {
					const result = await runProviderCommand(
						provider,
						buildPrShowCommand(provider, input.number),
						options,
						execOptions,
					);
					return {
						ok: true,
						provider,
						pr: parsePrShow(result.stdout),
					};
				}
				case 'ci_status': {
					const runsResult = await runProviderCommand(
						provider,
						buildCiRunsCommand(provider, {
							limit: input.limit,
							headSha: input.headSha,
						}),
						options,
						execOptions,
					);
					const runsJson = parseJsonText(runsResult.stdout);
					const runs = Array.isArray(runsJson)
						? runsJson
						: ((runsJson as { workflowRuns?: unknown[] })
								.workflowRuns ?? []);
					const jobsByRun: Record<string, unknown> = {};
					for (const runEntry of runs) {
						const run = runEntry as {
							databaseId?: string | number;
							id?: string | number;
							pipeline_id?: string | number;
						};
						const runId = String(
							run.databaseId ?? run.id ?? run.pipeline_id ?? '',
						);
						if (runId === '') continue;
						const jobsResult = await runProviderCommand(
							provider,
							buildCiJobsCommand(provider, runId),
							options,
							execOptions,
						);
						jobsByRun[runId] = parseJsonText(jobsResult.stdout);
					}
					return {
						ok: true,
						provider,
						status: parseCiStatus({
							sha: input.headSha,
							runs,
							jobsByRun,
							failingJobsOnly: input.failingJobsOnly,
						}),
					};
				}
				case 'issue_list': {
					const result = await runProviderCommand(
						provider,
						buildIssueListCommand(provider, {
							limit: input.limit,
							state: input.state,
						}),
						options,
						execOptions,
					);
					return {
						ok: true,
						provider,
						items: parseIssueList(result.stdout),
					};
				}
				case 'issue_show': {
					const result = await runProviderCommand(
						provider,
						buildIssueShowCommand(provider, input.number),
						options,
						execOptions,
					);
					return {
						ok: true,
						provider,
						issue: parseIssueShow(result.stdout),
					};
				}
			}
		} catch (error) {
			if (error instanceof MissingCliError) {
				return {
					ok: false,
					provider,
					error: error.message,
					hint: error.hint,
				};
			}
			return {
				ok: false,
				provider,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};
};

const BaseSchema = z.object({
	cwd: z.string().optional(),
	timeoutMs: z.number().int().positive().max(120000).optional(),
	limit: z.number().int().positive().max(100).optional(),
	state: z.enum(['open', 'closed', 'all']).optional(),
	headSha: z.string().optional(),
	failingJobsOnly: z.boolean().optional(),
});

const registerReadTool = <TArgs>(
	options: IForgeReadToolOptions,
	config: {
		readonly id: IForgeReadKind;
		readonly summary: string;
		readonly description: string;
		readonly inputSchema: z.ZodType<TArgs>;
		readonly outputSchema: z.ZodTypeAny;
		readonly mapArgs: (args: TArgs) => IForgeReadInput;
	},
): IToolRegistration => {
	const run = createForgeReadRunner(options);
	return {
		id: config.id,
		summary: config.summary,
		tags: ['forge', 'remote', 'read'],
		effects: ['spawn', 'network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_${config.id}`,
				{
					description: config.description,
					inputSchema: config.inputSchema,
					outputSchema: config.outputSchema,
				},
				async (args) => toolJson(await run(config.mapArgs(args))),
			);
		},
	};
};

export const buildForgeReadToolRegistrations = (
	options: IForgeReadToolOptions,
): readonly IToolRegistration[] => [
	registerReadTool(options, {
		id: 'pr_list',
		summary: 'List remote pull requests / merge requests via gh or glab.',
		description:
			"List remote pull requests (GitHub) or merge requests (GitLab) through the host's authenticated gh/glab CLI. Read-only; never stores or prompts for a PAT.",
		inputSchema: BaseSchema,
		outputSchema: buildListOutputSchema(PrListItemSchema),
		mapArgs: (args) => ({ kind: 'pr_list', ...args }),
	}),
	registerReadTool(options, {
		id: 'pr_show',
		summary: 'Show one remote pull request / merge request.',
		description:
			"Show one remote pull request / merge request including flattened commits and checks via the host's authenticated gh/glab CLI.",
		inputSchema: BaseSchema.extend({ number: z.number().int().positive() }),
		outputSchema: buildObjectOutputSchema('pr', PrShowSchema),
		mapArgs: (args) => ({ kind: 'pr_show', ...args }),
	}),
	registerReadTool(options, {
		id: 'ci_status',
		summary: 'Show CI status for the latest or requested commit SHA.',
		description:
			'Show CI runs and jobs for the latest or requested commit SHA. `failingJobsOnly:true` keeps only failing jobs in the result.',
		inputSchema: BaseSchema,
		outputSchema: buildObjectOutputSchema('status', CiStatusSchema),
		mapArgs: (args) => ({ kind: 'ci_status', ...args }),
	}),
	registerReadTool(options, {
		id: 'issue_list',
		summary: 'List remote issues via gh or glab.',
		description:
			"List remote issues through the host's authenticated gh/glab CLI. Read-only; never stores or prompts for a PAT.",
		inputSchema: BaseSchema,
		outputSchema: buildListOutputSchema(IssueListItemSchema),
		mapArgs: (args) => ({ kind: 'issue_list', ...args }),
	}),
	registerReadTool(options, {
		id: 'issue_show',
		summary: 'Show one remote issue via gh or glab.',
		description:
			"Show one remote issue with comments through the host's authenticated gh/glab CLI.",
		inputSchema: BaseSchema.extend({ number: z.number().int().positive() }),
		outputSchema: buildObjectOutputSchema('issue', IssueShowSchema),
		mapArgs: (args) => ({ kind: 'issue_show', ...args }),
	}),
];
