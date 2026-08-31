import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import z from 'zod';

import {
	toolJsonBounded,
	type IToolRegistration,
} from '@mcp-vertex/core/public';
import type { IRemoteProviderError } from '@mcp-vertex/contracts/remote-provider';

import {
	GitHubRequestError,
	createGitHubHttpClient,
	type IGitHubHttpRequestOptions,
} from '../client';
import type { IGitHubProviderContext } from '../config';

type GitHubHttpClient = ReturnType<typeof createGitHubHttpClient>;

export interface IGitHubToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly pluginCacheDir?: string;
	readonly context: IGitHubProviderContext;
	readonly client: Pick<GitHubHttpClient, 'request'>;
}

const ProviderSchema = z.literal('github');
const ErrorCodeSchema = z.enum([
	'unauthorized',
	'forbidden',
	'not-found',
	'rate-limited',
	'timeout',
	'transient',
	'api-incompatible',
	'invalid-response',
	'invalid-config',
]);
const ErrorValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);
const RemoteErrorSchema = z
	.object({
		code: ErrorCodeSchema,
		provider: ProviderSchema,
		message: z.string(),
		status: z.number().int().nullable(),
		requestId: z.string().nullable(),
		retryAfterSeconds: z.number().nullable(),
		temporary: z.boolean(),
		retryable: z.boolean(),
		originalBytes: z.number().int().nullable(),
		keptBytes: z.number().int().nullable(),
		originalLines: z.number().int().nullable(),
		keptLines: z.number().int().nullable(),
	})
	.strict();
const PaginationSchema = z
	.object({
		page: z.number().int().nullable(),
		perPage: z.number().int().nullable(),
		nextPage: z.string().nullable(),
	})
	.strict();
const RateLimitSchema = z
	.object({
		limit: z.number().int().nullable(),
		remaining: z.number().int().nullable(),
		reset: z.string().nullable(),
	})
	.strict();
const TruncationSchema = z
	.object({
		originalBytes: z.number().int().nullable(),
		keptBytes: z.number().int().nullable(),
		originalLines: z.number().int().nullable(),
		keptLines: z.number().int().nullable(),
	})
	.strict();
const ResponseMetaSchema = z
	.object({
		status: z.number().int(),
		requestId: z.string().nullable(),
		durationMs: z.number().int(),
		attempts: z.number().int(),
		pagination: PaginationSchema.nullable(),
		rateLimit: RateLimitSchema.nullable(),
		truncated: TruncationSchema.nullable(),
	})
	.strict();

const remoteResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
	z.union([
		z
			.object({
				ok: z.literal(true),
				provider: ProviderSchema,
				data: dataSchema,
				meta: ResponseMetaSchema,
			})
			.strict(),
		z
			.object({
				ok: z.literal(false),
				provider: ProviderSchema.optional(),
				error: RemoteErrorSchema,
			})
			.strict(),
	]);

const localResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
	z.union([
		z
			.object({
				ok: z.literal(true),
				provider: ProviderSchema,
				data: dataSchema,
			})
			.strict(),
		z
			.object({
				ok: z.literal(false),
				provider: ProviderSchema.optional(),
				error: RemoteErrorSchema,
			})
			.strict(),
	]);

const RepoSelectorSchema = z
	.object({
		owner: z.string().min(1).optional(),
		repository: z.string().min(1).optional(),
	})
	.strict();
const PagingSchema = z
	.object({
		page: z.number().int().positive().max(100000).optional(),
		perPage: z.number().int().positive().max(100).optional(),
		limit: z.number().int().positive().max(200).optional(),
	})
	.strict();

const UserSchema = z
	.object({
		login: z.string(),
	})
	.strict();
const LabelSchema = z
	.object({
		name: z.string(),
	})
	.strict();
const CommentSchema = z
	.object({
		author: z.string(),
		body: z.string(),
		createdAt: z.string().optional(),
		url: z.string().url().optional(),
	})
	.strict();
const ReviewSchema = z
	.object({
		author: z.string(),
		state: z.string(),
		body: z.string().optional(),
		submittedAt: z.string().optional(),
		url: z.string().url().optional(),
	})
	.strict();
const StatusSchema = z
	.object({
		context: z.string().optional(),
		state: z.string(),
		description: z.string().optional(),
		targetUrl: z.string().url().optional(),
	})
	.strict();
const CheckRunSchema = z
	.object({
		id: z.number().int(),
		name: z.string(),
		status: z.string(),
		conclusion: z.string().optional(),
		detailsUrl: z.string().url().optional(),
		startedAt: z.string().optional(),
		completedAt: z.string().optional(),
	})
	.strict();
const RepositorySchema = z
	.object({
		owner: z.string(),
		repository: z.string(),
		fullName: z.string(),
		htmlUrl: z.string().url(),
		apiUrl: z.string().url().optional(),
		description: z.string().nullable().optional(),
		defaultBranch: z.string().optional(),
		visibility: z.string().optional(),
		private: z.boolean().optional(),
		fork: z.boolean().optional(),
		archived: z.boolean().optional(),
		language: z.string().nullable().optional(),
		topics: z.array(z.string()).optional(),
		stars: z.number().int().optional(),
		watchers: z.number().int().optional(),
		openIssues: z.number().int().optional(),
		license: z.string().nullable().optional(),
		updatedAt: z.string().optional(),
	})
	.strict();
const IssueSchema = z
	.object({
		number: z.number().int(),
		title: z.string(),
		state: z.string(),
		body: z.string().optional(),
		url: z.string().url(),
		author: z.string(),
		labels: z.array(z.string()),
		commentsCount: z.number().int().optional(),
	})
	.strict();
const PullRequestSchema = z
	.object({
		number: z.number().int(),
		title: z.string(),
		state: z.string(),
		draft: z.boolean(),
		url: z.string().url(),
		author: z.string(),
		labels: z.array(z.string()),
		branch: z.string(),
		baseBranch: z.string().optional(),
		reviewDecision: z.string().optional(),
		mergeable: z.string().optional(),
	})
	.strict();
const CommitSchema = z
	.object({
		sha: z.string(),
		title: z.string(),
		message: z.string(),
		author: z.string().optional(),
		committer: z.string().optional(),
		url: z.string().url().optional(),
		date: z.string().optional(),
	})
	.strict();
const WorkflowSchema = z
	.object({
		id: z.number().int(),
		name: z.string(),
		path: z.string(),
		state: z.string(),
		url: z.string().url().optional(),
	})
	.strict();
const WorkflowRunSchema = z
	.object({
		id: z.number().int(),
		name: z.string(),
		workflow: z.string().optional(),
		branch: z.string().optional(),
		status: z.string(),
		conclusion: z.string().optional(),
		url: z.string().url(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
	})
	.strict();
const JobSchema = z
	.object({
		id: z.number().int(),
		name: z.string(),
		status: z.string(),
		conclusion: z.string().optional(),
		url: z.string().url().optional(),
		startedAt: z.string().optional(),
		completedAt: z.string().optional(),
	})
	.strict();
const ArtifactSchema = z
	.object({
		id: z.number().int(),
		name: z.string(),
		sizeInBytes: z.number().int().nonnegative().optional(),
		expired: z.boolean().optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
		archiveDownloadUrl: z.string().url().optional(),
	})
	.strict();
const ReleaseSchema = z
	.object({
		id: z.number().int(),
		tagName: z.string(),
		name: z.string().optional(),
		draft: z.boolean().optional(),
		prerelease: z.boolean().optional(),
		url: z.string().url().optional(),
		htmlUrl: z.string().url().optional(),
		publishedAt: z.string().optional(),
	})
	.strict();
const TagSchema = z
	.object({
		name: z.string(),
		sha: z.string(),
		url: z.string().url().optional(),
	})
	.strict();
const DeploymentSchema = z
	.object({
		id: z.number().int(),
		environment: z.string().optional(),
		description: z.string().optional(),
		sha: z.string().optional(),
		url: z.string().url().optional(),
		creator: z.string().optional(),
		createdAt: z.string().optional(),
	})
	.strict();
const VariableSchema = z
	.object({
		name: z.string(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
		visibility: z.string().optional(),
	})
	.strict();

const mapLabels = (items: readonly unknown[] | undefined): string[] =>
	(items ?? [])
		.map((item) => {
			if (!item || typeof item !== 'object') return '';
			const record = item as Record<string, unknown>;
			return typeof record.name === 'string' ? record.name : '';
		})
		.filter((label) => label.length > 0);

const mapUser = (value: unknown): string => {
	if (!value || typeof value !== 'object') return 'unknown';
	const record = value as Record<string, unknown>;
	if (typeof record.login === 'string' && record.login.length > 0) {
		return record.login;
	}
	return 'unknown';
};

const mapRepo = (
	value: Record<string, unknown>,
): z.infer<typeof RepositorySchema> => ({
	owner: mapUser(value.owner),
	repository: typeof value.name === 'string' ? value.name : 'unknown',
	fullName:
		typeof value.full_name === 'string'
			? value.full_name
			: `${mapUser(value.owner)}/${typeof value.name === 'string' ? value.name : 'unknown'}`,
	htmlUrl:
		typeof value.html_url === 'string'
			? value.html_url
			: 'https://github.com',
	apiUrl: typeof value.url === 'string' ? value.url : undefined,
	description:
		typeof value.description === 'string'
			? value.description
			: value.description === null
				? null
				: undefined,
	defaultBranch:
		typeof value.default_branch === 'string'
			? value.default_branch
			: undefined,
	visibility:
		typeof value.visibility === 'string' ? value.visibility : undefined,
	private: typeof value.private === 'boolean' ? value.private : undefined,
	fork: typeof value.fork === 'boolean' ? value.fork : undefined,
	archived: typeof value.archived === 'boolean' ? value.archived : undefined,
	language:
		typeof value.language === 'string'
			? value.language
			: value.language === null
				? null
				: undefined,
	topics: Array.isArray(value.topics)
		? value.topics.filter((topic) => typeof topic === 'string')
		: undefined,
	stars:
		typeof value.stargazers_count === 'number'
			? value.stargazers_count
			: undefined,
	watchers:
		typeof value.watchers_count === 'number'
			? value.watchers_count
			: undefined,
	openIssues:
		typeof value.open_issues_count === 'number'
			? value.open_issues_count
			: undefined,
	license: (() => {
		const license = value.license;
		if (license === undefined) return undefined;
		if (license === null) return null;
		if (typeof license !== 'object') return undefined;
		const record = license as Record<string, any>;
		return typeof record.spdx_id === 'string' ? record.spdx_id : null;
	})(),
	updatedAt:
		typeof value.updated_at === 'string' ? value.updated_at : undefined,
});

const resolveRepo = (
	context: IGitHubProviderContext,
	args: z.infer<typeof RepoSelectorSchema>,
): { readonly owner: string; readonly repository: string } => {
	const owner = args.owner ?? context.repository?.owner;
	const repository = args.repository ?? context.repository?.repository;
	if (owner === undefined || repository === undefined) {
		throw new Error('github tool requires owner and repository');
	}
	return { owner, repository };
};

const requestFailure = (
	error: unknown,
): {
	ok: false;
	provider?: 'github';
	error: z.infer<typeof RemoteErrorSchema>;
} => {
	if (error instanceof GitHubRequestError) {
		return {
			ok: false,
			provider: 'github',
			error: error.remoteError as z.infer<typeof RemoteErrorSchema>,
		};
	}
	const message = error instanceof Error ? error.message : String(error);
	return {
		ok: false,
		provider: 'github',
		error: {
			code: 'invalid-response',
			provider: 'github',
			message,
			status: null,
			requestId: null,
			retryAfterSeconds: null,
			temporary: false,
			retryable: false,
			originalBytes: null,
			keptBytes: null,
			originalLines: null,
			keptLines: null,
		},
	};
};

const wrapRemote = async <T>(fn: () => Promise<T>) => {
	try {
		return await fn();
	} catch (error) {
		return requestFailure(error);
	}
};

const wrapLocal = async <T>(fn: () => Promise<T>) => {
	try {
		return await fn();
	} catch (error) {
		return requestFailure(error);
	}
};

const registerRemoteTool = (
	options: IGitHubToolOptions,
	id: string,
	description: string,
	inputSchema: z.ZodTypeAny,
	outputSchema: z.ZodTypeAny,
	handler: (args: any) => Promise<any>,
	tags: readonly string[],
	summary: string,
): IToolRegistration => ({
	id,
	tags: [...tags],
	effects: ['network'],
	summary,
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_${id}`,
			{ description, inputSchema, outputSchema },
			async (args: unknown) =>
				toolJsonBounded(await wrapRemote(() => handler(args))),
		);
	},
});

const registerLocalTool = (
	options: IGitHubToolOptions,
	id: string,
	description: string,
	inputSchema: z.ZodTypeAny,
	outputSchema: z.ZodTypeAny,
	handler: (args: any) => Promise<any>,
	summary: string,
): IToolRegistration => ({
	id,
	tags: ['github', 'context'],
	summary,
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_${id}`,
			{ description, inputSchema, outputSchema },
			async (args: unknown) =>
				toolJsonBounded(await wrapLocal(() => handler(args))),
		);
	},
});

const paginationFrom = (
	meta: NonNullable<
		Awaited<ReturnType<GitHubHttpClient['request']>>['meta']['pagination']
	>,
) => ({
	page: meta.page,
	perPage: meta.perPage,
	nextPage: meta.nextPage,
	previousPage: meta.previousPage,
	total: meta.total,
	totalPages: meta.totalPages,
	hasMore: meta.hasMore,
});

const textLimit = (args: {
	text: string;
	maxBytes?: number;
	maxLines?: number;
	maxMs?: number;
	startedAt: number;
}) => {
	const originalBytes = Buffer.byteLength(args.text, 'utf8');
	const originalLines =
		args.text.length === 0 ? 0 : args.text.split(/\r?\n/).length;
	let text = args.text;
	let reason: 'byte-limit' | 'line-limit' | 'time-limit' | null = null;
	if (args.maxLines !== undefined && args.maxLines >= 0) {
		const lines = text.split(/\r?\n/);
		if (lines.length > args.maxLines) {
			text = lines.slice(0, args.maxLines).join('\n');
			reason = 'line-limit';
		}
	}
	if (args.maxBytes !== undefined && args.maxBytes >= 0) {
		while (Buffer.byteLength(text, 'utf8') > args.maxBytes) {
			text = text.slice(0, Math.max(0, text.length - 1));
			reason = 'byte-limit';
			if (text.length === 0) break;
		}
	}
	if (args.maxMs !== undefined && Date.now() - args.startedAt > args.maxMs) {
		reason = 'time-limit';
	}
	return {
		text,
		truncated: reason !== null,
		reason,
		originalBytes,
		keptBytes: Buffer.byteLength(text, 'utf8'),
		originalLines,
		keptLines: text.length === 0 ? 0 : text.split(/\r?\n/).length,
	};
};

const ensureContainedPath = (rootAbs: string, relativePath: string): string => {
	const resolvedRoot = resolve(rootAbs);
	const target = resolve(resolvedRoot, relativePath);
	if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}/`)) {
		throw new Error(
			'github artifact path must stay inside the plugin cache dir',
		);
	}
	return target;
};

const safeWriteJson = async (
	rootAbs: string,
	relativePath: string,
	value: unknown,
) => {
	const abs = ensureContainedPath(rootAbs, relativePath);
	await mkdir(resolve(abs, '..'), { recursive: true });
	await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
	return abs;
};

const ensureCacheDir = (options: IGitHubToolOptions): string =>
	options.pluginCacheDir === undefined
		? resolve(options.workspaceRootAbs, '.mcp-vertex-cache', 'github')
		: resolve(options.workspaceRootAbs, options.pluginCacheDir);

const pageQuery = (args: {
	page?: number;
	perPage?: number;
	limit?: number;
}) => ({
	page: args.page ?? 1,
	per_page: Math.min(args.perPage ?? args.limit ?? 20, 100),
	...(args.limit !== undefined ? { limit: args.limit } : {}),
});

const firstText = (value: unknown): string | undefined => {
	if (typeof value === 'string') return value;
	if (!value || typeof value !== 'object') return undefined;
	const record = value as Record<string, unknown>;
	return typeof record.text === 'string' ? record.text : undefined;
};

const requestJson = async <T>(
	client: IGitHubToolOptions['client'],
	request: IGitHubHttpRequestOptions<T>,
): Promise<Awaited<ReturnType<IGitHubToolOptions['client']['request']>>> =>
	client.request(request);

const appendPageItems = <T>(target: T[], source: T[]) => {
	target.push(...source);
	return target;
};

const resolveListLimit = (args: { limit?: number; perPage?: number }): number =>
	args.limit ?? args.perPage ?? 20;

const pruneToLimit = <T>(items: T[], limit: number): T[] =>
	items.length > limit ? items.slice(0, limit) : items;

export const buildGitHubContextToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const inputSchema = z
		.object({ detail: z.enum(['compact', 'normal', 'full']).optional() })
		.strict();
	const outputSchema = localResultSchema(
		z
			.object({
				provider: ProviderSchema,
				host: z.string(),
				apiBaseUrl: z.string(),
				webBaseUrl: z.string(),
				repository: z
					.object({
						owner: z.string().optional(),
						repository: z.string().optional(),
						displayName: z.string().optional(),
						webUrl: z.string().optional(),
						apiUrl: z.string().optional(),
					})
					.nullable(),
				sources: z.object({
					token: z.string(),
					apiBaseUrl: z.string(),
					webBaseUrl: z.string(),
					repository: z.array(z.string()),
				}),
				readOnly: z.boolean(),
				capabilities: z.array(z.string()),
			})
			.strict(),
	);
	return [
		registerLocalTool(
			options,
			'context',
			'Return the configured GitHub provider context.',
			inputSchema,
			outputSchema,
			async () => ({
				ok: true as const,
				provider: 'github' as const,
				data: {
					provider: 'github' as const,
					host: options.context.host,
					apiBaseUrl: options.context.apiBaseUrl,
					webBaseUrl: options.context.webBaseUrl,
					repository: options.context.repository,
					sources: options.context.sources,
					readOnly: true,
					capabilities: [
						'repositories',
						'issues',
						'pull-requests',
						'commits',
						'checks',
						'workflows',
						'jobs',
						'artifacts',
						'releases',
						'tags',
						'deployments',
						'variables',
						'search',
					],
				},
			}),
			'GitHub provider context',
		),
	];
};

export const buildGitHubRepositoriesToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const repositoryOutput = remoteResultSchema(RepositorySchema);
	const searchOutput = remoteResultSchema(
		z
			.object({
				items: z.array(RepositorySchema),
				page: z.number().int(),
				perPage: z.number().int(),
				nextPage: z.string().nullable(),
				totalCount: z.number().int().nullable(),
				incompleteResults: z.boolean().optional(),
			})
			.strict(),
	);
	const variablesOutput = remoteResultSchema(
		z
			.object({
				items: z.array(VariableSchema),
				page: z.number().int(),
				perPage: z.number().int(),
				nextPage: z.string().nullable(),
			})
			.strict(),
	);
	return [
		registerRemoteTool(
			options,
			'repositories_get',
			'Get repository metadata.',
			RepoSelectorSchema,
			repositoryOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				return options.client
					.request({
						path: `/repos/${repo.owner}/${repo.repository}`,
						responseSchema: z
							.object({
								owner: UserSchema,
								name: z.string(),
								full_name: z.string(),
								html_url: z.string().url(),
								url: z.string().url().optional(),
								description: z.string().nullable().optional(),
								default_branch: z.string().optional(),
								visibility: z.string().optional(),
								private: z.boolean().optional(),
								fork: z.boolean().optional(),
								archived: z.boolean().optional(),
								language: z.string().nullable().optional(),
								topics: z.array(z.string()).optional(),
								stargazers_count: z.number().int().optional(),
								watchers_count: z.number().int().optional(),
								open_issues_count: z.number().int().optional(),
								license: z
									.object({
										spdx_id: z
											.string()
											.nullable()
											.optional(),
									})
									.optional(),
								updated_at: z.string().optional(),
							})
							.strict(),
					})
					.then((result) => ({
						...result,
						data: mapRepo(result.data as Record<string, any>),
					}));
			},
			['github', 'repositories'],
			'Get repository metadata.',
		),
		registerRemoteTool(
			options,
			'repositories_search',
			'Search repositories with an explicit page and limit.',
			z
				.object({
					query: z.string().min(1),
					owner: z.string().min(1).optional(),
					page: z.number().int().positive().optional(),
					perPage: z.number().int().positive().max(100).optional(),
					limit: z.number().int().positive().max(100).optional(),
				})
				.strict(),
			searchOutput,
			async (args) => {
				const perPage = args.perPage ?? args.limit ?? 20;
				const firstPage = args.page ?? 1;
				const limit = args.limit ?? perPage;
				const items: z.infer<typeof RepositorySchema>[] = [];
				let currentPage = firstPage;
				let finalMeta = null as
					| Awaited<
							ReturnType<IGitHubToolOptions['client']['request']>
					  >['meta']
					| null;
				while (items.length < limit) {
					const result = await options.client.request({
						path: '/search/repositories',
						query: {
							q:
								args.owner !== undefined
									? `${args.owner} ${args.query}`
									: args.query,
							page: currentPage,
							per_page: Math.min(perPage, 100),
						},
						responseSchema: z
							.object({
								total_count: z.number().int(),
								incomplete_results: z.boolean().optional(),
								items: z.array(
									z.record(z.string(), z.unknown()),
								),
							})
							.strict(),
					});
					finalMeta = result.meta;
					appendPageItems(
						items,
						result.data.items.map((item) =>
							mapRepo(item as Record<string, any>),
						),
					);
					const nextPage = result.meta.pagination?.nextPage;
					if (nextPage === null || items.length >= limit) break;
					const parsed = Number(nextPage);
					currentPage =
						Number.isFinite(parsed) && parsed > currentPage
							? parsed
							: currentPage + 1;
				}
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						items: pruneToLimit(items, limit),
						page: firstPage,
						perPage,
						nextPage: finalMeta?.pagination?.nextPage ?? null,
						totalCount: finalMeta?.pagination?.total ?? null,
						incompleteResults: undefined,
					},
					meta: finalMeta!,
				};
			},
			['github', 'repositories', 'search'],
			'Search repositories with an explicit limit.',
		),
		registerRemoteTool(
			options,
			'repositories_variables',
			'List repository variable metadata without values.',
			RepoSelectorSchema.extend({
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(100).optional(),
			}),
			variablesOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const perPage = args.perPage ?? args.limit ?? 20;
				const firstPage = args.page ?? 1;
				const limit = args.limit ?? perPage;
				const items: z.infer<typeof VariableSchema>[] = [];
				let currentPage = firstPage;
				let meta:
					| Awaited<
							ReturnType<IGitHubToolOptions['client']['request']>
					  >['meta']
					| null = null;
				while (items.length < limit) {
					const result = await options.client.request({
						path: `/repos/${repo.owner}/${repo.repository}/actions/variables`,
						query: {
							page: currentPage,
							per_page: Math.min(perPage, 100),
						},
						responseSchema: z
							.object({
								variables: z.array(
									z
										.object({
											name: z.string(),
											created_at: z.string().optional(),
											updated_at: z.string().optional(),
											visibility: z.string().optional(),
										})
										.strict(),
								),
							})
							.strict(),
					});
					meta = result.meta;
					items.push(
						...result.data.variables.map((variable) => ({
							name: variable.name,
							createdAt: variable.created_at,
							updatedAt: variable.updated_at,
							visibility: variable.visibility,
						})),
					);
					const nextPage = result.meta.pagination?.nextPage;
					if (nextPage === null || items.length >= limit) break;
					const parsed = Number(nextPage);
					currentPage =
						Number.isFinite(parsed) && parsed > currentPage
							? parsed
							: currentPage + 1;
				}
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						items: pruneToLimit(items, limit),
						page: firstPage,
						perPage,
						nextPage: meta?.pagination?.nextPage ?? null,
					},
					meta: meta!,
				};
			},
			['github', 'repositories', 'variables'],
			'List repository variable metadata.',
		),
	];
};

export const buildGitHubIssuesToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const issueListOutput = remoteResultSchema(
		z
			.object({
				items: z.array(IssueSchema),
				page: z.number().int(),
				perPage: z.number().int(),
				nextPage: z.string().nullable(),
			})
			.strict(),
	);
	const issueShowOutput = remoteResultSchema(
		z
			.object({
				issue: IssueSchema.extend({ comments: z.array(CommentSchema) }),
			})
			.strict(),
	);
	return [
		registerRemoteTool(
			options,
			'issues_list',
			'List issues with explicit paging.',
			RepoSelectorSchema.extend({
				state: z.enum(['open', 'closed', 'all']).optional(),
				labels: z.array(z.string()).optional(),
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(200).optional(),
			}),
			issueListOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const perPage = args.perPage ?? args.limit ?? 20;
				const limit = args.limit ?? perPage;
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/issues`,
					query: {
						state: args.state ?? 'open',
						labels: args.labels?.join(','),
						page: args.page ?? 1,
						per_page: Math.min(perPage, 100),
					},
					responseSchema: z.array(z.record(z.string(), z.unknown())),
				});
				const items = result.data
					.filter((issue) => issue.pull_request === undefined)
					.map((issue) => ({
						number:
							typeof issue.number === 'number' ? issue.number : 0,
						title:
							typeof issue.title === 'string' ? issue.title : '',
						state:
							typeof issue.state === 'string'
								? issue.state
								: 'unknown',
						body:
							typeof issue.body === 'string'
								? issue.body
								: undefined,
						url:
							typeof issue.html_url === 'string'
								? issue.html_url
								: 'https://github.com',
						author: mapUser(issue.user),
						labels: mapLabels(
							Array.isArray(issue.labels)
								? issue.labels
								: undefined,
						),
						commentsCount:
							typeof issue.comments === 'number'
								? issue.comments
								: undefined,
					}))
					.slice(0, limit);
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						items,
						page: result.meta.pagination?.page ?? args.page ?? 1,
						perPage:
							result.meta.pagination?.perPage ??
							Math.min(perPage, 100),
						nextPage: result.meta.pagination?.nextPage ?? null,
					},
					meta: result.meta,
				};
			},
			['github', 'issues'],
			'List issues.',
		),
		registerRemoteTool(
			options,
			'issues_show',
			'Show one issue and its comments.',
			RepoSelectorSchema.extend({
				issue: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
			}),
			issueShowOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const issueNumber = String(args.issue);
				const issueResult = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/issues/${issueNumber}`,
					responseSchema: z.record(z.string(), z.unknown()),
				});
				const commentsResult = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/issues/${issueNumber}/comments`,
					query: { per_page: 100, page: 1 },
					responseSchema: z.array(z.record(z.string(), z.unknown())),
				});
				const issue = issueResult.data as Record<string, any>;
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						issue: {
							number:
								typeof issue.number === 'number'
									? issue.number
									: Number(issueNumber),
							title:
								typeof issue.title === 'string'
									? issue.title
									: '',
							state:
								typeof issue.state === 'string'
									? issue.state
									: 'unknown',
							body:
								typeof issue.body === 'string'
									? issue.body
									: '',
							url:
								typeof issue.html_url === 'string'
									? issue.html_url
									: 'https://github.com',
							author: mapUser(issue.user),
							labels: mapLabels(
								Array.isArray(issue.labels)
									? issue.labels
									: undefined,
							),
							comments: commentsResult.data.map((comment) => ({
								author: mapUser(comment.user),
								body:
									typeof comment.body === 'string'
										? comment.body
										: '',
								createdAt:
									typeof comment.created_at === 'string'
										? comment.created_at
										: undefined,
								url:
									typeof comment.html_url === 'string'
										? comment.html_url
										: undefined,
							})),
						},
					},
					meta: commentsResult.meta,
				};
			},
			['github', 'issues'],
			'Show an issue with its comments.',
		),
	];
};

const pullRequestDetailSchema = PullRequestSchema.extend({
	comments: z.array(CommentSchema),
	reviews: z.array(ReviewSchema),
	status: z.array(StatusSchema).optional(),
});

export const buildGitHubPullRequestsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const listOutput = remoteResultSchema(
		z
			.object({
				items: z.array(PullRequestSchema),
				page: z.number().int(),
				perPage: z.number().int(),
				nextPage: z.string().nullable(),
			})
			.strict(),
	);
	const showOutput = remoteResultSchema(
		z.object({ pullRequest: pullRequestDetailSchema }).strict(),
	);
	return [
		registerRemoteTool(
			options,
			'pull_requests_list',
			'List pull requests with explicit paging.',
			RepoSelectorSchema.extend({
				state: z.enum(['open', 'closed', 'all']).optional(),
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(200).optional(),
			}),
			listOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/pulls`,
					query: {
						state: args.state ?? 'open',
						page: args.page ?? 1,
						per_page: Math.min(
							args.perPage ?? args.limit ?? 20,
							100,
						),
					},
					responseSchema: z.array(z.record(z.string(), z.unknown())),
				});
				const items = result.data.map((pr) => {
					const prRecord = pr as Record<string, unknown>;
					const head =
						prRecord.head && typeof prRecord.head === 'object'
							? (prRecord.head as Record<string, unknown>)
							: null;
					const base =
						prRecord.base && typeof prRecord.base === 'object'
							? (prRecord.base as Record<string, unknown>)
							: null;
					return {
						number:
							typeof prRecord.number === 'number'
								? prRecord.number
								: 0,
						title:
							typeof prRecord.title === 'string'
								? prRecord.title
								: '',
						state:
							typeof prRecord.state === 'string'
								? prRecord.state
								: 'unknown',
						draft:
							typeof prRecord.draft === 'boolean'
								? prRecord.draft
								: false,
						url:
							typeof prRecord.html_url === 'string'
								? prRecord.html_url
								: 'https://github.com',
						author: mapUser(prRecord.user),
						labels: mapLabels(
							Array.isArray(prRecord.labels)
								? prRecord.labels
								: undefined,
						),
						branch:
							head && typeof head.ref === 'string'
								? head.ref
								: '',
						baseBranch:
							base && typeof base.ref === 'string'
								? base.ref
								: undefined,
						reviewDecision:
							typeof prRecord.reviewDecision === 'string'
								? prRecord.reviewDecision
								: undefined,
						mergeable:
							typeof prRecord.mergeable_state === 'string'
								? prRecord.mergeable_state
								: undefined,
					};
				});
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						items,
						page: result.meta.pagination?.page ?? args.page ?? 1,
						perPage:
							result.meta.pagination?.perPage ??
							Math.min(args.perPage ?? args.limit ?? 20, 100),
						nextPage: result.meta.pagination?.nextPage ?? null,
					},
					meta: result.meta,
				};
			},
			['github', 'pull-requests'],
			'List pull requests.',
		),
		registerRemoteTool(
			options,
			'pull_requests_show',
			'Show one pull request with comments and reviews.',
			RepoSelectorSchema.extend({
				pr: z.union([z.string().min(1), z.number().int().positive()]),
			}),
			showOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const prNumber = String(args.pr);
				const [prResult, commentsResult, reviewsResult] =
					await Promise.all([
						options.client.request({
							path: `/repos/${repo.owner}/${repo.repository}/pulls/${prNumber}`,
							responseSchema: z.record(z.string(), z.unknown()),
						}),
						options.client.request({
							path: `/repos/${repo.owner}/${repo.repository}/issues/${prNumber}/comments`,
							query: { per_page: 100, page: 1 },
							responseSchema: z.array(
								z.record(z.string(), z.unknown()),
							),
						}),
						options.client.request({
							path: `/repos/${repo.owner}/${repo.repository}/pulls/${prNumber}/reviews`,
							query: { per_page: 100, page: 1 },
							responseSchema: z.array(
								z.record(z.string(), z.unknown()),
							),
						}),
					]);
				const pr = prResult.data as Record<string, any>;
				const prAny = pr as any;
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						pullRequest: {
							number:
								typeof pr.number === 'number'
									? pr.number
									: Number(prNumber),
							title: typeof pr.title === 'string' ? pr.title : '',
							state:
								typeof pr.state === 'string'
									? pr.state
									: 'unknown',
							draft:
								typeof pr.draft === 'boolean'
									? pr.draft
									: false,
							url:
								typeof pr.html_url === 'string'
									? pr.html_url
									: 'https://github.com',
							author: mapUser(pr.user),
							labels: mapLabels(
								Array.isArray(pr.labels)
									? pr.labels
									: undefined,
							),
							branch:
								typeof prAny.head?.ref === 'string'
									? prAny.head.ref
									: '',
							baseBranch:
								typeof prAny.base?.ref === 'string'
									? prAny.base.ref
									: undefined,
							reviewDecision:
								typeof pr.reviewDecision === 'string'
									? pr.reviewDecision
									: undefined,
							mergeable:
								typeof pr.mergeable_state === 'string'
									? pr.mergeable_state
									: undefined,
							comments: commentsResult.data.map((comment) => ({
								author: mapUser(comment.user),
								body:
									typeof comment.body === 'string'
										? comment.body
										: '',
								createdAt:
									typeof comment.created_at === 'string'
										? comment.created_at
										: undefined,
								url:
									typeof comment.html_url === 'string'
										? comment.html_url
										: undefined,
							})),
							reviews: reviewsResult.data.map((review) => ({
								author: mapUser(review.user),
								state:
									typeof review.state === 'string'
										? review.state
										: 'unknown',
								body:
									typeof review.body === 'string'
										? review.body
										: undefined,
								submittedAt:
									typeof review.submitted_at === 'string'
										? review.submitted_at
										: undefined,
								url:
									typeof review.html_url === 'string'
										? review.html_url
										: undefined,
							})),
						},
					},
					meta: prResult.meta,
				};
			},
			['github', 'pull-requests'],
			'Show a pull request with its comments and reviews.',
		),
	];
};

export const buildGitHubCommitsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const commitListOutput = remoteResultSchema(
		z
			.object({
				items: z.array(CommitSchema),
				page: z.number().int(),
				perPage: z.number().int(),
				nextPage: z.string().nullable(),
			})
			.strict(),
	);
	const commitShowOutput = remoteResultSchema(
		z
			.object({
				commit: CommitSchema.extend({
					files: z
						.array(
							z
								.object({
									filename: z.string(),
									status: z.string().optional(),
									additions: z.number().int().optional(),
									deletions: z.number().int().optional(),
									changes: z.number().int().optional(),
								})
								.strict(),
						)
						.optional(),
					stats: z
						.object({
							additions: z.number().int().optional(),
							deletions: z.number().int().optional(),
							total: z.number().int().optional(),
						})
						.strict()
						.optional(),
					statuses: z.array(StatusSchema).optional(),
					checkRuns: z.array(CheckRunSchema).optional(),
				}),
			})
			.strict(),
	);
	return [
		registerRemoteTool(
			options,
			'commits_list',
			'List commits with explicit paging.',
			RepoSelectorSchema.extend({
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(200).optional(),
				sha: z.string().min(1).optional(),
			}),
			commitListOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/commits`,
					query: {
						sha: args.sha,
						page: args.page ?? 1,
						per_page: Math.min(
							args.perPage ?? args.limit ?? 20,
							100,
						),
					},
					responseSchema: z.array(z.record(z.string(), z.unknown())),
				});
				const items = result.data.map((commit) => {
					const commitAny = commit as any;
					return {
						sha: typeof commit.sha === 'string' ? commit.sha : '',
						title:
							typeof commitAny.commit?.message === 'string'
								? (commitAny.commit.message.split('\n')[0] ??
									'')
								: '',
						message:
							typeof commitAny.commit?.message === 'string'
								? commitAny.commit.message
								: '',
						author: mapUser(commit.author),
						committer: mapUser(commit.committer),
						url:
							typeof commit.html_url === 'string'
								? commit.html_url
								: undefined,
						date:
							typeof commitAny.commit?.author?.date === 'string'
								? commitAny.commit.author.date
								: undefined,
					};
				});
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						items,
						page: result.meta.pagination?.page ?? args.page ?? 1,
						perPage:
							result.meta.pagination?.perPage ??
							Math.min(args.perPage ?? args.limit ?? 20, 100),
						nextPage: result.meta.pagination?.nextPage ?? null,
					},
					meta: result.meta,
				};
			},
			['github', 'commits'],
			'List commits.',
		),
		registerRemoteTool(
			options,
			'commits_show',
			'Show one commit with file stats.',
			RepoSelectorSchema.extend({ sha: z.string().min(1) }),
			commitShowOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const [commitResult, statusResult, checkRunsResult] =
					await Promise.all([
						options.client.request({
							path: `/repos/${repo.owner}/${repo.repository}/commits/${args.sha}`,
							responseSchema: z.record(z.string(), z.unknown()),
						}),
						options.client.request({
							path: `/repos/${repo.owner}/${repo.repository}/commits/${args.sha}/status`,
							responseSchema: z.record(z.string(), z.unknown()),
						}),
						options.client.request({
							path: `/repos/${repo.owner}/${repo.repository}/commits/${args.sha}/check-runs`,
							query: { per_page: 100, page: 1 },
							responseSchema: z.record(z.string(), z.unknown()),
						}),
					]);
				const commit = commitResult.data as Record<string, any>;
				const commitAny = commit as any;
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						commit: {
							sha:
								typeof commit.sha === 'string'
									? commit.sha
									: args.sha,
							title:
								typeof commitAny.commit?.message === 'string'
									? (commitAny.commit.message.split(
											'\n',
										)[0] ?? '')
									: '',
							message:
								typeof commitAny.commit?.message === 'string'
									? commitAny.commit.message
									: '',
							author: mapUser(commit.author),
							committer: mapUser(commit.committer),
							url:
								typeof commit.html_url === 'string'
									? commit.html_url
									: undefined,
							date:
								typeof commitAny.commit?.author?.date ===
								'string'
									? commitAny.commit.author.date
									: undefined,
							files: Array.isArray(commit.files)
								? commit.files.map((file) => ({
										filename:
											typeof file.filename === 'string'
												? file.filename
												: '',
										status:
											typeof file.status === 'string'
												? file.status
												: undefined,
										additions:
											typeof file.additions === 'number'
												? file.additions
												: undefined,
										deletions:
											typeof file.deletions === 'number'
												? file.deletions
												: undefined,
										changes:
											typeof file.changes === 'number'
												? file.changes
												: undefined,
									}))
								: undefined,
							stats:
								typeof commit.stats === 'object' &&
								commit.stats !== null
									? {
											additions:
												typeof (
													commit.stats as Record<
														string,
														unknown
													>
												).additions === 'number'
													? (
															commit.stats as Record<
																string,
																unknown
															>
														).additions
													: undefined,
											deletions:
												typeof (
													commit.stats as Record<
														string,
														unknown
													>
												).deletions === 'number'
													? (
															commit.stats as Record<
																string,
																unknown
															>
														).deletions
													: undefined,
											total:
												typeof (
													commit.stats as Record<
														string,
														unknown
													>
												).total === 'number'
													? (
															commit.stats as Record<
																string,
																unknown
															>
														).total
													: undefined,
										}
									: undefined,
							statuses: Array.isArray(statusResult.data.statuses)
								? statusResult.data.statuses.map((status) => ({
										context:
											typeof status.context === 'string'
												? status.context
												: undefined,
										state:
											typeof status.state === 'string'
												? status.state
												: 'unknown',
										description:
											typeof status.description ===
											'string'
												? status.description
												: undefined,
										targetUrl:
											typeof status.target_url ===
											'string'
												? status.target_url
												: undefined,
									}))
								: undefined,
							checkRuns: Array.isArray(
								checkRunsResult.data.check_runs,
							)
								? checkRunsResult.data.check_runs.map(
										(checkRun) => ({
											id:
												typeof checkRun.id === 'number'
													? checkRun.id
													: 0,
											name:
												typeof checkRun.name ===
												'string'
													? checkRun.name
													: '',
											status:
												typeof checkRun.status ===
												'string'
													? checkRun.status
													: 'unknown',
											conclusion:
												typeof checkRun.conclusion ===
												'string'
													? checkRun.conclusion
													: undefined,
											detailsUrl:
												typeof checkRun.details_url ===
												'string'
													? checkRun.details_url
													: undefined,
											startedAt:
												typeof checkRun.started_at ===
												'string'
													? checkRun.started_at
													: undefined,
											completedAt:
												typeof checkRun.completed_at ===
												'string'
													? checkRun.completed_at
													: undefined,
										}),
									)
								: undefined,
						},
					},
					meta: commitResult.meta,
				};
			},
			['github', 'commits'],
			'Show a commit with statuses and check runs.',
		),
		registerRemoteTool(
			options,
			'commit_statuses',
			'Show combined commit statuses.',
			RepoSelectorSchema.extend({ sha: z.string().min(1) }),
			remoteResultSchema(
				z
					.object({
						commit: z
							.object({
								sha: z.string(),
								statuses: z.array(StatusSchema),
							})
							.strict(),
					})
					.strict(),
			),
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/commits/${args.sha}/status`,
					responseSchema: z.record(z.string(), z.unknown()),
				});
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						commit: {
							sha: args.sha,
							statuses: Array.isArray(result.data.statuses)
								? result.data.statuses.map((status) => ({
										context:
											typeof status.context === 'string'
												? status.context
												: undefined,
										state:
											typeof status.state === 'string'
												? status.state
												: 'unknown',
										description:
											typeof status.description ===
											'string'
												? status.description
												: undefined,
										targetUrl:
											typeof status.target_url ===
											'string'
												? status.target_url
												: undefined,
									}))
								: [],
						},
					},
					meta: result.meta,
				};
			},
			['github', 'checks'],
			'Show commit status checks.',
		),
	];
};

export const buildGitHubChecksToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const checkRunsOutput = remoteResultSchema(
		z.object({ checkRuns: z.array(CheckRunSchema) }).strict(),
	);
	return [
		registerRemoteTool(
			options,
			'checks_runs',
			'List check runs for a commit or branch ref.',
			RepoSelectorSchema.extend({
				ref: z.string().min(1),
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(200).optional(),
			}),
			checkRunsOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/commits/${args.ref}/check-runs`,
					query: {
						per_page: Math.min(
							args.perPage ?? args.limit ?? 20,
							100,
						),
						page: args.page ?? 1,
					},
					responseSchema: z.record(z.string(), z.unknown()),
				});
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						checkRuns: Array.isArray(result.data.check_runs)
							? result.data.check_runs.map((checkRun) => ({
									id:
										typeof checkRun.id === 'number'
											? checkRun.id
											: 0,
									name:
										typeof checkRun.name === 'string'
											? checkRun.name
											: '',
									status:
										typeof checkRun.status === 'string'
											? checkRun.status
											: 'unknown',
									conclusion:
										typeof checkRun.conclusion === 'string'
											? checkRun.conclusion
											: undefined,
									detailsUrl:
										typeof checkRun.details_url === 'string'
											? checkRun.details_url
											: undefined,
									startedAt:
										typeof checkRun.started_at === 'string'
											? checkRun.started_at
											: undefined,
									completedAt:
										typeof checkRun.completed_at ===
										'string'
											? checkRun.completed_at
											: undefined,
								}))
							: [],
					},
					meta: result.meta,
				};
			},
			['github', 'checks'],
			'List check runs.',
		),
	];
};

export const buildGitHubWorkflowsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const workflowListOutput = remoteResultSchema(
		z.object({ workflows: z.array(WorkflowSchema) }).strict(),
	);
	const runListOutput = remoteResultSchema(
		z.object({ runs: z.array(WorkflowRunSchema) }).strict(),
	);
	const runShowOutput = remoteResultSchema(
		z
			.object({
				run: WorkflowRunSchema.extend({ jobs: z.array(JobSchema) }),
			})
			.strict(),
	);
	return [
		registerRemoteTool(
			options,
			'workflows_list',
			'List workflow definitions.',
			RepoSelectorSchema,
			workflowListOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/actions/workflows`,
					responseSchema: z.record(z.string(), z.unknown()),
				});
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						workflows: Array.isArray(result.data.workflows)
							? result.data.workflows.map((workflow) => ({
									id:
										typeof workflow.id === 'number'
											? workflow.id
											: 0,
									name:
										typeof workflow.name === 'string'
											? workflow.name
											: '',
									path:
										typeof workflow.path === 'string'
											? workflow.path
											: '',
									state:
										typeof workflow.state === 'string'
											? workflow.state
											: 'unknown',
									url:
										typeof workflow.html_url === 'string'
											? workflow.html_url
											: undefined,
								}))
							: [],
					},
					meta: result.meta,
				};
			},
			['github', 'workflows'],
			'List workflows.',
		),
		registerRemoteTool(
			options,
			'workflows_runs',
			'List workflow runs.',
			RepoSelectorSchema.extend({
				workflowId: z
					.union([z.string().min(1), z.number().int().positive()])
					.optional(),
				branch: z.string().optional(),
				status: z.string().optional(),
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(200).optional(),
			}),
			runListOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const path =
					args.workflowId !== undefined
						? `/repos/${repo.owner}/${repo.repository}/actions/workflows/${args.workflowId}/runs`
						: `/repos/${repo.owner}/${repo.repository}/actions/runs`;
				const result = await options.client.request({
					path,
					query: {
						branch: args.branch,
						status: args.status,
						page: args.page ?? 1,
						per_page: Math.min(
							args.perPage ?? args.limit ?? 20,
							100,
						),
					},
					responseSchema: z.record(z.string(), z.unknown()),
				});
				const runs = Array.isArray(result.data.workflow_runs)
					? result.data.workflow_runs.map((run) => ({
							id: typeof run.id === 'number' ? run.id : 0,
							name: typeof run.name === 'string' ? run.name : '',
							workflow:
								typeof run.workflow_id === 'number'
									? String(run.workflow_id)
									: undefined,
							branch:
								typeof run.head_branch === 'string'
									? run.head_branch
									: undefined,
							status:
								typeof run.status === 'string'
									? run.status
									: 'unknown',
							conclusion:
								typeof run.conclusion === 'string'
									? run.conclusion
									: undefined,
							url:
								typeof run.html_url === 'string'
									? run.html_url
									: 'https://github.com',
							createdAt:
								typeof run.created_at === 'string'
									? run.created_at
									: undefined,
							updatedAt:
								typeof run.updated_at === 'string'
									? run.updated_at
									: undefined,
						}))
					: [];
				return {
					ok: true as const,
					provider: 'github' as const,
					data: { runs },
					meta: result.meta,
				};
			},
			['github', 'workflows'],
			'List workflow runs.',
		),
		registerRemoteTool(
			options,
			'workflow_run',
			'Show one workflow run with its jobs.',
			RepoSelectorSchema.extend({
				runId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
			}),
			runShowOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const [runResult, jobsResult] = await Promise.all([
					options.client.request({
						path: `/repos/${repo.owner}/${repo.repository}/actions/runs/${args.runId}`,
						responseSchema: z.record(z.string(), z.unknown()),
					}),
					options.client.request({
						path: `/repos/${repo.owner}/${repo.repository}/actions/runs/${args.runId}/jobs`,
						responseSchema: z.record(z.string(), z.unknown()),
					}),
				]);
				const run = runResult.data as Record<string, any>;
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						run: {
							id:
								typeof run.id === 'number'
									? run.id
									: Number(args.runId),
							name: typeof run.name === 'string' ? run.name : '',
							workflow:
								typeof run.workflow_id === 'number'
									? String(run.workflow_id)
									: undefined,
							branch:
								typeof run.head_branch === 'string'
									? run.head_branch
									: undefined,
							status:
								typeof run.status === 'string'
									? run.status
									: 'unknown',
							conclusion:
								typeof run.conclusion === 'string'
									? run.conclusion
									: undefined,
							url:
								typeof run.html_url === 'string'
									? run.html_url
									: 'https://github.com',
							createdAt:
								typeof run.created_at === 'string'
									? run.created_at
									: undefined,
							updatedAt:
								typeof run.updated_at === 'string'
									? run.updated_at
									: undefined,
							jobs: Array.isArray(jobsResult.data.jobs)
								? jobsResult.data.jobs.map((job) => ({
										id:
											typeof job.id === 'number'
												? job.id
												: 0,
										name:
											typeof job.name === 'string'
												? job.name
												: '',
										status:
											typeof job.status === 'string'
												? job.status
												: 'unknown',
										conclusion:
											typeof job.conclusion === 'string'
												? job.conclusion
												: undefined,
										url:
											typeof job.html_url === 'string'
												? job.html_url
												: undefined,
										startedAt:
											typeof job.started_at === 'string'
												? job.started_at
												: undefined,
										completedAt:
											typeof job.completed_at === 'string'
												? job.completed_at
												: undefined,
									}))
								: [],
						},
					},
					meta: runResult.meta,
				};
			},
			['github', 'workflows', 'jobs'],
			'Show a workflow run.',
		),
	];
};

export const buildGitHubJobsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const jobsOutput = remoteResultSchema(
		z.object({ jobs: z.array(JobSchema) }).strict(),
	);
	const logsOutput = remoteResultSchema(
		z
			.object({
				log: z.string(),
				logPath: z.string().optional(),
				truncation: TruncationSchema,
			})
			.strict(),
	);
	return [
		registerRemoteTool(
			options,
			'jobs_list',
			'List jobs for a workflow run.',
			RepoSelectorSchema.extend({
				runId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
			}),
			jobsOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/actions/runs/${args.runId}/jobs`,
					responseSchema: z.record(z.string(), z.unknown()),
				});
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						jobs: Array.isArray(result.data.jobs)
							? result.data.jobs.map((job) => ({
									id: typeof job.id === 'number' ? job.id : 0,
									name:
										typeof job.name === 'string'
											? job.name
											: '',
									status:
										typeof job.status === 'string'
											? job.status
											: 'unknown',
									conclusion:
										typeof job.conclusion === 'string'
											? job.conclusion
											: undefined,
									url:
										typeof job.html_url === 'string'
											? job.html_url
											: undefined,
									startedAt:
										typeof job.started_at === 'string'
											? job.started_at
											: undefined,
									completedAt:
										typeof job.completed_at === 'string'
											? job.completed_at
											: undefined,
								}))
							: [],
					},
					meta: result.meta,
				};
			},
			['github', 'jobs'],
			'List jobs.',
		),
		registerRemoteTool(
			options,
			'jobs_logs',
			'Fetch job logs with explicit truncation and optional local persistence.',
			RepoSelectorSchema.extend({
				jobId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
				maxBytes: z.number().int().positive().max(1_000_000).optional(),
				maxLines: z.number().int().positive().max(100_000).optional(),
				maxMs: z.number().int().positive().max(60_000).optional(),
				persist: z.boolean().optional(),
			}),
			logsOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const startedAt = Date.now();
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/actions/jobs/${args.jobId}/logs`,
					parseAs: 'text',
				});
				const rawLog = firstText(result.data) ?? '';
				const truncation = textLimit({
					text: rawLog,
					maxBytes: args.maxBytes,
					maxLines: args.maxLines,
					maxMs: args.maxMs,
					startedAt,
				});
				let logPath: string | undefined;
				if (
					args.persist === true &&
					options.pluginCacheDir !== undefined
				) {
					const root = ensureCacheDir(options);
					logPath = await safeWriteJson(
						root,
						join('jobs', `${String(args.jobId)}.log.json`),
						{
							log: truncation.text,
							truncated: truncation.truncated,
							reason: truncation.reason,
						},
					);
				}
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						log: truncation.text,
						...(logPath !== undefined ? { logPath } : {}),
						truncation: {
							truncated: truncation.truncated,
							reason: truncation.reason,
							originalBytes: truncation.originalBytes,
							keptBytes: truncation.keptBytes,
							originalLines: truncation.originalLines,
							keptLines: truncation.keptLines,
						},
					},
					meta: result.meta,
				};
			},
			['github', 'jobs', 'logs'],
			'Fetch truncated job logs.',
		),
	];
};

export const buildGitHubArtifactsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const artifactOutput = remoteResultSchema(
		z
			.object({
				artifacts: z.array(ArtifactSchema),
				page: z.number().int(),
				perPage: z.number().int(),
				nextPage: z.string().nullable(),
				snapshotPath: z.string().optional(),
			})
			.strict(),
	);
	return [
		registerRemoteTool(
			options,
			'artifacts_list',
			'List workflow artifacts and optionally persist a local snapshot.',
			RepoSelectorSchema.extend({
				runId: z
					.union([z.string().min(1), z.number().int().positive()])
					.optional(),
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(200).optional(),
				persistSnapshot: z.boolean().optional(),
			}),
			artifactOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const path =
					args.runId !== undefined
						? `/repos/${repo.owner}/${repo.repository}/actions/runs/${args.runId}/artifacts`
						: `/repos/${repo.owner}/${repo.repository}/actions/artifacts`;
				const result = await options.client.request({
					path,
					query: {
						page: args.page ?? 1,
						per_page: Math.min(
							args.perPage ?? args.limit ?? 20,
							100,
						),
					},
					responseSchema: z.record(z.string(), z.unknown()),
				});
				const artifacts = Array.isArray(result.data.artifacts)
					? result.data.artifacts.map((artifact) => ({
							id:
								typeof artifact.id === 'number'
									? artifact.id
									: 0,
							name:
								typeof artifact.name === 'string'
									? artifact.name
									: '',
							sizeInBytes:
								typeof artifact.size_in_bytes === 'number'
									? artifact.size_in_bytes
									: undefined,
							expired:
								typeof artifact.expired === 'boolean'
									? artifact.expired
									: undefined,
							createdAt:
								typeof artifact.created_at === 'string'
									? artifact.created_at
									: undefined,
							updatedAt:
								typeof artifact.updated_at === 'string'
									? artifact.updated_at
									: undefined,
							archiveDownloadUrl:
								typeof artifact.archive_download_url ===
								'string'
									? artifact.archive_download_url
									: undefined,
						}))
					: [];
				let snapshotPath: string | undefined;
				if (
					args.persistSnapshot === true &&
					options.pluginCacheDir !== undefined
				) {
					const root = ensureCacheDir(options);
					snapshotPath = await safeWriteJson(
						root,
						join(
							'artifacts',
							`${String(args.runId ?? 'repo')}.json`,
						),
						{ artifacts },
					);
				}
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						artifacts,
						page: result.meta.pagination?.page ?? args.page ?? 1,
						perPage:
							result.meta.pagination?.perPage ??
							Math.min(args.perPage ?? args.limit ?? 20, 100),
						nextPage: result.meta.pagination?.nextPage ?? null,
						...(snapshotPath !== undefined ? { snapshotPath } : {}),
					},
					meta: result.meta,
				};
			},
			['github', 'artifacts'],
			'List artifacts.',
		),
	];
};

export const buildGitHubReleasesToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const releaseListOutput = remoteResultSchema(
		z
			.object({
				releases: z.array(ReleaseSchema),
				page: z.number().int(),
				perPage: z.number().int(),
				nextPage: z.string().nullable(),
			})
			.strict(),
	);
	const releaseShowOutput = remoteResultSchema(
		z.object({ release: ReleaseSchema }).strict(),
	);
	const tagListOutput = remoteResultSchema(
		z
			.object({
				tags: z.array(TagSchema),
				page: z.number().int(),
				perPage: z.number().int(),
				nextPage: z.string().nullable(),
			})
			.strict(),
	);
	return [
		registerRemoteTool(
			options,
			'releases_list',
			'List releases with explicit paging.',
			RepoSelectorSchema.extend({
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(200).optional(),
			}),
			releaseListOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/releases`,
					query: {
						page: args.page ?? 1,
						per_page: Math.min(
							args.perPage ?? args.limit ?? 20,
							100,
						),
					},
					responseSchema: z.array(z.record(z.string(), z.unknown())),
				});
				const releases = result.data.map((release) => ({
					id: typeof release.id === 'number' ? release.id : 0,
					tagName:
						typeof release.tag_name === 'string'
							? release.tag_name
							: '',
					name:
						typeof release.name === 'string'
							? release.name
							: undefined,
					draft:
						typeof release.draft === 'boolean'
							? release.draft
							: undefined,
					prerelease:
						typeof release.prerelease === 'boolean'
							? release.prerelease
							: undefined,
					url:
						typeof release.url === 'string'
							? release.url
							: undefined,
					htmlUrl:
						typeof release.html_url === 'string'
							? release.html_url
							: undefined,
					publishedAt:
						typeof release.published_at === 'string'
							? release.published_at
							: undefined,
				}));
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						releases,
						page: result.meta.pagination?.page ?? args.page ?? 1,
						perPage:
							result.meta.pagination?.perPage ??
							Math.min(args.perPage ?? args.limit ?? 20, 100),
						nextPage: result.meta.pagination?.nextPage ?? null,
					},
					meta: result.meta,
				};
			},
			['github', 'releases'],
			'List releases.',
		),
		registerRemoteTool(
			options,
			'releases_show',
			'Show one release.',
			RepoSelectorSchema.extend({
				releaseId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
			}),
			releaseShowOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/releases/${args.releaseId}`,
					responseSchema: z.record(z.string(), z.unknown()),
				});
				const release = result.data as Record<string, any>;
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						release: {
							id:
								typeof release.id === 'number'
									? release.id
									: Number(args.releaseId),
							tagName:
								typeof release.tag_name === 'string'
									? release.tag_name
									: '',
							name:
								typeof release.name === 'string'
									? release.name
									: undefined,
							draft:
								typeof release.draft === 'boolean'
									? release.draft
									: undefined,
							prerelease:
								typeof release.prerelease === 'boolean'
									? release.prerelease
									: undefined,
							url:
								typeof release.url === 'string'
									? release.url
									: undefined,
							htmlUrl:
								typeof release.html_url === 'string'
									? release.html_url
									: undefined,
							publishedAt:
								typeof release.published_at === 'string'
									? release.published_at
									: undefined,
						},
					},
					meta: result.meta,
				};
			},
			['github', 'releases'],
			'Show a release.',
		),
		registerRemoteTool(
			options,
			'tags_list',
			'List tags.',
			RepoSelectorSchema.extend({
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(200).optional(),
			}),
			tagListOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/tags`,
					query: {
						page: args.page ?? 1,
						per_page: Math.min(
							args.perPage ?? args.limit ?? 20,
							100,
						),
					},
					responseSchema: z.array(z.record(z.string(), z.unknown())),
				});
				const tags = result.data.map((tag) => {
					const tagAny = tag as any;
					return {
						name: typeof tag.name === 'string' ? tag.name : '',
						sha:
							typeof tagAny.commit?.sha === 'string'
								? tagAny.commit.sha
								: '',
						url:
							typeof tagAny.commit?.url === 'string'
								? tagAny.commit.url
								: undefined,
					};
				});
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						tags,
						page: result.meta.pagination?.page ?? args.page ?? 1,
						perPage:
							result.meta.pagination?.perPage ??
							Math.min(args.perPage ?? args.limit ?? 20, 100),
						nextPage: result.meta.pagination?.nextPage ?? null,
					},
					meta: result.meta,
				};
			},
			['github', 'tags'],
			'List tags.',
		),
	];
};

export const buildGitHubDeploymentsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => {
	const deploymentListOutput = remoteResultSchema(
		z
			.object({
				deployments: z.array(DeploymentSchema),
				page: z.number().int(),
				perPage: z.number().int(),
				nextPage: z.string().nullable(),
			})
			.strict(),
	);
	const deploymentStatusOutput = remoteResultSchema(
		z
			.object({
				statuses: z.array(
					z
						.object({
							state: z.string(),
							description: z.string().optional(),
							environmentUrl: z.string().url().optional(),
							createdAt: z.string().optional(),
						})
						.strict(),
				),
			})
			.strict(),
	);
	return [
		registerRemoteTool(
			options,
			'deployments_list',
			'List deployments.',
			RepoSelectorSchema.extend({
				page: z.number().int().positive().optional(),
				perPage: z.number().int().positive().max(100).optional(),
				limit: z.number().int().positive().max(200).optional(),
			}),
			deploymentListOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/deployments`,
					query: {
						page: args.page ?? 1,
						per_page: Math.min(
							args.perPage ?? args.limit ?? 20,
							100,
						),
					},
					responseSchema: z.array(z.record(z.string(), z.unknown())),
				});
				const deployments = result.data.map((deployment) => ({
					id: typeof deployment.id === 'number' ? deployment.id : 0,
					environment:
						typeof deployment.environment === 'string'
							? deployment.environment
							: undefined,
					description:
						typeof deployment.description === 'string'
							? deployment.description
							: undefined,
					sha:
						typeof deployment.sha === 'string'
							? deployment.sha
							: undefined,
					url:
						typeof deployment.url === 'string'
							? deployment.url
							: undefined,
					creator: mapUser(deployment.creator),
					createdAt:
						typeof deployment.created_at === 'string'
							? deployment.created_at
							: undefined,
				}));
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						deployments,
						page: result.meta.pagination?.page ?? args.page ?? 1,
						perPage:
							result.meta.pagination?.perPage ??
							Math.min(args.perPage ?? args.limit ?? 20, 100),
						nextPage: result.meta.pagination?.nextPage ?? null,
					},
					meta: result.meta,
				};
			},
			['github', 'deployments'],
			'List deployments.',
		),
		registerRemoteTool(
			options,
			'deployment_statuses',
			'List deployment status history.',
			RepoSelectorSchema.extend({
				deploymentId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
			}),
			deploymentStatusOutput,
			async (args) => {
				const repo = resolveRepo(options.context, args);
				const result = await options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/deployments/${args.deploymentId}/statuses`,
					responseSchema: z.array(z.record(z.string(), z.unknown())),
				});
				return {
					ok: true as const,
					provider: 'github' as const,
					data: {
						statuses: result.data.map((status) => ({
							state:
								typeof status.state === 'string'
									? status.state
									: 'unknown',
							description:
								typeof status.description === 'string'
									? status.description
									: undefined,
							environmentUrl:
								typeof status.environment_url === 'string'
									? status.environment_url
									: undefined,
							createdAt:
								typeof status.created_at === 'string'
									? status.created_at
									: undefined,
						})),
					},
					meta: result.meta,
				};
			},
			['github', 'deployments'],
			'List deployment statuses.',
		),
	];
};

export const buildGitHubToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	...buildGitHubContextToolRegistrations(options),
	...buildGitHubRepositoriesToolRegistrations(options),
	...buildGitHubIssuesToolRegistrations(options),
	...buildGitHubPullRequestsToolRegistrations(options),
	...buildGitHubCommitsToolRegistrations(options),
	...buildGitHubChecksToolRegistrations(options),
	...buildGitHubWorkflowsToolRegistrations(options),
	...buildGitHubJobsToolRegistrations(options),
	...buildGitHubArtifactsToolRegistrations(options),
	...buildGitHubReleasesToolRegistrations(options),
	...buildGitHubDeploymentsToolRegistrations(options),
];

export { remoteResultSchema, localResultSchema };
