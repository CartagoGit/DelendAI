import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import z from 'zod';

import {
	toolJsonBounded,
	writeFileAtomic,
	type IToolRegistration,
} from '@delendai/core/public';
import type { IRemoteProviderError } from '@delendai/contracts/remote-provider';

import { GitHubRequestError } from '../client';
import type { IGitHubProviderContext } from '../config';

type GitHubClient = { readonly request: (request: any) => Promise<any> };

export interface IGitHubToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly pluginCacheDir?: string;
	readonly context: IGitHubProviderContext;
	readonly client: GitHubClient;
}

const providerSchema = z.literal('github');

const redactToken = (value: string, token: string): string => {
	if (token.length === 0 || value.length === 0) return value;
	return value
		.split(`Bearer ${token}`)
		.join('Bearer [REDACTED]')
		.split(token)
		.join('[REDACTED]');
};

const sanitizeDetails = (
	details:
		| Readonly<Record<string, string | number | boolean | null>>
		| undefined,
	token: string,
) => {
	if (details === undefined) return undefined;
	return Object.fromEntries(
		Object.entries(details).map(([key, value]) => [
			key,
			typeof value === 'string' ? redactToken(value, token) : value,
		]),
	);
};
const paginationSchema = z
	.object({
		page: z.number().int().nullable(),
		perPage: z.number().int().nullable(),
		nextPage: z.string().nullable(),
		previousPage: z.string().nullable(),
		total: z.number().int().nullable(),
		totalPages: z.number().int().nullable(),
		hasMore: z.boolean(),
	})
	.nullable();
const rateLimitSchema = z
	.object({
		limit: z.number().int().nullable(),
		remaining: z.number().int().nullable(),
		resetAt: z.string().nullable(),
		retryAfterSeconds: z.number().nullable(),
		scope: z.string(),
		source: z.string(),
	})
	.nullable();
const truncationSchema = z
	.object({
		truncated: z.boolean(),
		reason: z.string().nullable(),
		originalBytes: z.number().int().nullable(),
		keptBytes: z.number().int().nullable(),
		originalLines: z.number().int().nullable(),
		keptLines: z.number().int().nullable(),
	})
	.nullable();
const responseMetaSchema = z
	.object({
		status: z.number().int(),
		requestId: z.string().nullable(),
		durationMs: z.number().nonnegative(),
		attempts: z.number().int().positive(),
		pagination: paginationSchema,
		rateLimit: rateLimitSchema,
		truncated: truncationSchema,
	})
	.strict();
const repositoryCoordinatesSchema = z
	.object({
		provider: providerSchema,
		host: z.string(),
		owner: z.string().optional(),
		repository: z.string().optional(),
		projectId: z.union([z.string(), z.number()]).optional(),
		projectPath: z.string().optional(),
		displayName: z.string().optional(),
		webUrl: z.string().url().optional(),
		apiUrl: z.string().url().optional(),
	})
	.strict();
const contextSourcesSchema = z
	.object({
		token: z.string(),
		apiBaseUrl: z.enum(['plugin', 'env', 'default']),
		webBaseUrl: z.enum(['plugin', 'env', 'default']),
		repository: z.array(z.enum(['plugin', 'env', 'default'])),
	})
	.strict();
const errorSchema = z
	.object({
		code: z.enum([
			'unauthorized',
			'forbidden',
			'not-found',
			'rate-limited',
			'timeout',
			'transient',
			'api-incompatible',
			'invalid-response',
			'invalid-config',
		]),
		provider: providerSchema,
		message: z.string(),
		status: z.number().int().nullable(),
		requestId: z.string().nullable(),
		retryAfterSeconds: z.number().nullable(),
		temporary: z.boolean(),
		retryable: z.boolean(),
		details: z
			.record(
				z.string(),
				z.union([z.string(), z.number(), z.boolean(), z.null()]),
			)
			.optional(),
	})
	.strict();
const envelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
	z.union([
		z
			.object({
				ok: z.literal(true),
				provider: providerSchema,
				data: dataSchema,
				meta: responseMetaSchema,
			})
			.strict(),
		z
			.object({
				ok: z.literal(false),
				provider: providerSchema.optional(),
				error: errorSchema,
			})
			.strict(),
	]);

const localEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
	z.union([
		z
			.object({
				ok: z.literal(true),
				provider: providerSchema,
				data: dataSchema,
			})
			.strict(),
		z
			.object({
				ok: z.literal(false),
				provider: providerSchema.optional(),
				error: errorSchema,
			})
			.strict(),
	]);

const repoSelectorSchema = z
	.object({
		owner: z.string().min(1).optional(),
		repository: z.string().min(1).optional(),
	})
	.strict();
const pagingSchema = z
	.object({
		page: z.number().int().positive().optional(),
		perPage: z.number().int().positive().max(100).optional(),
		limit: z.number().int().positive().max(200).optional(),
	})
	.strict();

const repositorySchema = z
	.object({
		owner: z.string(),
		repository: z.string(),
		fullName: z.string(),
		htmlUrl: z.string().url(),
	})
	.strict();
const commentSchema = z
	.object({
		author: z.string(),
		body: z.string(),
		createdAt: z.string().optional(),
		url: z.string().url().optional(),
	})
	.strict();
const reviewSchema = z
	.object({
		author: z.string(),
		state: z.string(),
		body: z.string().optional(),
		submittedAt: z.string().optional(),
		url: z.string().url().optional(),
	})
	.strict();
const issueSchema = z
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
const pullRequestSchema = z
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
		comments: z.array(commentSchema).optional(),
		reviews: z.array(reviewSchema).optional(),
	})
	.strict();
const statusSchema = z
	.object({
		context: z.string().optional(),
		state: z.string(),
		description: z.string().optional(),
		targetUrl: z.string().url().optional(),
	})
	.strict();
const checkRunSchema = z
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
const commitSchema = z
	.object({
		sha: z.string(),
		title: z.string(),
		message: z.string(),
		author: z.string().optional(),
		committer: z.string().optional(),
		url: z.string().url().optional(),
		date: z.string().optional(),
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
		statuses: z.array(statusSchema).optional(),
		checkRuns: z.array(checkRunSchema).optional(),
	})
	.strict();
const workflowSchema = z
	.object({
		id: z.number().int(),
		name: z.string(),
		path: z.string(),
		state: z.string(),
		url: z.string().url().optional(),
	})
	.strict();
const workflowRunSchema = z
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
		jobs: z
			.array(
				z
					.object({
						id: z.number().int(),
						name: z.string(),
						status: z.string(),
						conclusion: z.string().optional(),
						url: z.string().url().optional(),
						startedAt: z.string().optional(),
						completedAt: z.string().optional(),
					})
					.strict(),
			)
			.optional(),
	})
	.strict();
const jobSchema = z
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
const artifactSchema = z
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
const releaseSchema = z
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
const tagSchema = z
	.object({
		name: z.string(),
		sha: z.string(),
		url: z.string().url().optional(),
	})
	.strict();
const deploymentSchema = z
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
const variableSchema = z
	.object({
		name: z.string(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
		visibility: z.string().optional(),
	})
	.strict();
const pagedCollectionSchema = <T extends z.ZodTypeAny>(
	field: string,
	item: T,
) =>
	z
		.object({
			[field]: z.array(item),
			page: z.number().int(),
			perPage: z.number().int(),
			nextPage: z.string().nullable(),
		})
		.strict();

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === 'object' ? (value as Record<string, any>) : {};
const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;
const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const asBool = (value: unknown): boolean | undefined =>
	typeof value === 'boolean' ? value : undefined;

const mapUser = (value: unknown): string =>
	asString(asRecord(value).login) ?? 'unknown';
const mapLabels = (value: unknown): string[] =>
	asArray(value)
		.map((item) => asString(asRecord(item).name) ?? '')
		.filter((label): label is string => label.length > 0);
const mapRepository = (value: unknown) => {
	const repo = asRecord(value);
	const owner = mapUser(repo.owner);
	return {
		owner,
		repository: asString(repo.name) ?? 'unknown',
		fullName:
			asString(repo.full_name) ??
			`${owner}/${asString(repo.name) ?? 'unknown'}`,
		htmlUrl: asString(repo.html_url) ?? 'https://github.com',
	};
};
const mapIssue = (value: unknown) => {
	const issue = asRecord(value);
	return {
		number: asNumber(issue.number) ?? 0,
		title: asString(issue.title) ?? '',
		state: asString(issue.state) ?? 'unknown',
		body: asString(issue.body),
		url: asString(issue.html_url) ?? 'https://github.com',
		author: mapUser(issue.user),
		labels: mapLabels(issue.labels),
		commentsCount: asNumber(issue.comments),
	};
};
const mapPullRequest = (value: unknown) => {
	const pr = asRecord(value);
	const head = asRecord(pr.head);
	const base = asRecord(pr.base);
	return {
		number: asNumber(pr.number) ?? 0,
		title: asString(pr.title) ?? '',
		state: asString(pr.state) ?? 'unknown',
		draft: asBool(pr.draft) ?? false,
		url: asString(pr.html_url) ?? 'https://github.com',
		author: mapUser(pr.user),
		labels: mapLabels(pr.labels),
		branch: asString(head.ref) ?? '',
		baseBranch: asString(base.ref),
		reviewDecision: asString(pr.reviewDecision),
		mergeable: asString(pr.mergeable_state),
	};
};
const mapCommit = (value: unknown) => {
	const commit = asRecord(value);
	const inner = asRecord(commit.commit);
	const author = asRecord(inner.author);
	return {
		sha: asString(commit.sha) ?? '',
		title: (asString(inner.message) ?? '').split('\n')[0] ?? '',
		message: asString(inner.message) ?? '',
		author: mapUser(commit.author),
		committer: mapUser(commit.committer),
		url: asString(commit.html_url),
		date: asString(author.date),
		files: asArray(commit.files).map((file) => {
			const item = asRecord(file);
			return {
				filename: asString(item.filename) ?? '',
				status: asString(item.status),
				additions: asNumber(item.additions),
				deletions: asNumber(item.deletions),
				changes: asNumber(item.changes),
			};
		}),
		stats:
			commit.stats && typeof commit.stats === 'object'
				? {
						additions: asNumber(commit.stats.additions),
						deletions: asNumber(commit.stats.deletions),
						total: asNumber(commit.stats.total),
					}
				: undefined,
		statuses: asArray(commit.statuses ?? commit.status).map((status) => {
			const item = asRecord(status);
			return {
				context: asString(item.context),
				state: asString(item.state) ?? 'unknown',
				description: asString(item.description),
				targetUrl: asString(item.target_url ?? item.targetUrl),
			};
		}),
		checkRuns: asArray(commit.check_runs ?? commit.checkRuns).map(
			(checkRun) => {
				const item = asRecord(checkRun);
				return {
					id: asNumber(item.id) ?? 0,
					name: asString(item.name) ?? '',
					status: asString(item.status) ?? 'unknown',
					conclusion: asString(item.conclusion),
					detailsUrl: asString(item.details_url ?? item.detailsUrl),
					startedAt: asString(item.started_at ?? item.startedAt),
					completedAt: asString(
						item.completed_at ?? item.completedAt,
					),
				};
			},
		),
	};
};
const mapWorkflow = (value: unknown) => {
	const item = asRecord(value);
	return {
		id: asNumber(item.id) ?? 0,
		name: asString(item.name) ?? '',
		path: asString(item.path) ?? '',
		state: asString(item.state) ?? 'unknown',
		url: asString(item.html_url),
	};
};
const mapWorkflowRun = (value: unknown) => {
	const item = asRecord(value);
	return {
		id: asNumber(item.id) ?? 0,
		name: asString(item.name) ?? '',
		workflow: asString(item.workflow_id ?? item.workflow),
		branch: asString(item.head_branch),
		status: asString(item.status) ?? 'unknown',
		conclusion: asString(item.conclusion),
		url: asString(item.html_url) ?? 'https://github.com',
		createdAt: asString(item.created_at),
		updatedAt: asString(item.updated_at),
	};
};
const mapJob = (value: unknown) => {
	const item = asRecord(value);
	return {
		id: asNumber(item.id) ?? 0,
		name: asString(item.name) ?? '',
		status: asString(item.status) ?? 'unknown',
		conclusion: asString(item.conclusion),
		url: asString(item.html_url),
		startedAt: asString(item.started_at),
		completedAt: asString(item.completed_at),
	};
};
const mapArtifact = (value: unknown) => {
	const item = asRecord(value);
	return {
		id: asNumber(item.id) ?? 0,
		name: asString(item.name) ?? '',
		sizeInBytes: asNumber(item.size_in_bytes),
		expired: asBool(item.expired),
		createdAt: asString(item.created_at),
		updatedAt: asString(item.updated_at),
		archiveDownloadUrl: asString(item.archive_download_url),
	};
};
const mapRelease = (value: unknown) => {
	const item = asRecord(value);
	return {
		id: asNumber(item.id) ?? 0,
		tagName: asString(item.tag_name) ?? '',
		name: asString(item.name),
		draft: asBool(item.draft),
		prerelease: asBool(item.prerelease),
		url: asString(item.url),
		htmlUrl: asString(item.html_url),
		publishedAt: asString(item.published_at),
	};
};
const mapTag = (value: unknown) => {
	const item = asRecord(value);
	const commit = asRecord(item.commit);
	return {
		name: asString(item.name) ?? '',
		sha: asString(commit.sha) ?? '',
		url: asString(commit.url),
	};
};
const mapDeployment = (value: unknown) => {
	const item = asRecord(value);
	return {
		id: asNumber(item.id) ?? 0,
		environment: asString(item.environment),
		description: asString(item.description),
		sha: asString(item.sha),
		url: asString(item.url),
		creator: mapUser(item.creator),
		createdAt: asString(item.created_at),
	};
};
const mapVariable = (value: unknown) => {
	const item = asRecord(value);
	return {
		name: asString(item.name) ?? '',
		createdAt: asString(item.created_at),
		updatedAt: asString(item.updated_at),
		visibility: asString(item.visibility),
	};
};

const resolveRepo = (
	context: IGitHubProviderContext,
	args: { owner?: string; repository?: string },
): { owner: string; repository: string } => {
	const owner = args.owner ?? context.repository?.owner;
	const repository = args.repository ?? context.repository?.repository;
	if (!owner || !repository)
		throw new Error('github tool requires owner and repository');
	return { owner, repository };
};
const normalizeError = (
	error: unknown,
	token: string,
): IRemoteProviderError => {
	if (error instanceof GitHubRequestError) {
		const remote = error.remoteError;
		const base: IRemoteProviderError = {
			code: remote.code,
			provider: remote.provider,
			status: remote.status,
			requestId: remote.requestId,
			retryAfterSeconds: remote.retryAfterSeconds,
			temporary: remote.temporary,
			retryable: remote.retryable,
			message: redactToken(remote.message, token),
		};
		return remote.details === undefined
			? base
			: {
					...base,
					details: sanitizeDetails(remote.details, token) as Readonly<
						Record<string, string | number | boolean | null>
					>,
				};
	}
	if (
		error instanceof Error &&
		(error.message.includes('requires owner and repository') ||
			error.message.includes('must stay inside the plugin cache dir'))
	) {
		return {
			code: 'invalid-config',
			provider: 'github',
			message: redactToken(error.message, token),
			status: null,
			requestId: null,
			retryAfterSeconds: null,
			temporary: false,
			retryable: false,
		};
	}
	return {
		code: 'invalid-response',
		provider: 'github',
		message: redactToken(
			error instanceof Error ? error.message : String(error),
			token,
		),
		status: null,
		requestId: null,
		retryAfterSeconds: null,
		temporary: false,
		retryable: false,
	};
};
const _failureEnvelope = (error: unknown, token: string) => ({
	ok: false as const,
	provider: 'github' as const,
	error: normalizeError(error, token),
});
const cacheRoot = (options: IGitHubToolOptions): string =>
	options.pluginCacheDir === undefined
		? resolve(options.workspaceRootAbs, '.delendai-cache', 'github')
		: resolve(options.workspaceRootAbs, options.pluginCacheDir);
const writeJsonWithinCache = async (
	rootAbs: string,
	relativePath: string,
	value: unknown,
) => {
	const root = resolve(rootAbs);
	const target = resolve(root, relativePath);
	if (target !== root && !target.startsWith(`${root}/`))
		throw new Error(
			'github artifact path must stay inside the plugin cache dir',
		);
	await mkdir(resolve(target, '..'), { recursive: true });
	await writeFileAtomic(target, `${JSON.stringify(value, null, 2)}\n`);
	return target;
};
const queryFrom = (args: {
	page?: number;
	perPage?: number;
	limit?: number;
}) => ({
	page: args.page ?? 1,
	per_page: Math.min(args.perPage ?? args.limit ?? 20, 100),
});

const registerRemoteTool = (
	options: IGitHubToolOptions,
	id: string,
	description: string,
	inputSchema: z.ZodTypeAny,
	outputSchema: z.ZodTypeAny,
	handler: (args: any) => Promise<any>,
	tags: string[],
	summary: string,
): IToolRegistration => ({
	id,
	tags,
	effects: ['network'],
	summary,
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_${id}`,
			{ description, inputSchema, outputSchema },
			async (args: unknown) => {
				try {
					return toolJsonBounded(await handler(args));
				} catch (error) {
					return toolJsonBounded(
						_failureEnvelope(error, options.context.token),
					);
				}
			},
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
	tags: ['github'],
	summary,
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_${id}`,
			{ description, inputSchema, outputSchema },
			async (args: unknown) => {
				try {
					return toolJsonBounded(await handler(args));
				} catch (error) {
					return toolJsonBounded(
						_failureEnvelope(error, options.context.token),
					);
				}
			},
		);
	},
});

export const buildGitHubContextToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerLocalTool(
		options,
		'context',
		'Return the configured GitHub provider context.',
		z
			.object({
				detail: z.enum(['compact', 'normal', 'full']).optional(),
			})
			.strict(),
		localEnvelopeSchema(
			z
				.object({
					provider: providerSchema,
					host: z.string(),
					apiBaseUrl: z.string().url(),
					webBaseUrl: z.string().url(),
					repository: repositoryCoordinatesSchema.nullable(),
					sources: contextSourcesSchema,
					readOnly: z.boolean(),
					capabilities: z.array(z.string()),
				})
				.strict(),
		),
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
					'logs',
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

export const buildGitHubRepositoriesToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'repositories_get',
		'Get repository metadata.',
		repoSelectorSchema,
		envelopeSchema(z.object({ repository: repositorySchema }).strict()),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}`,
				responseSchema: z.record(z.string(), z.unknown()),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: { repository: mapRepository(result.data) },
				meta: result.meta,
			};
		},
		['github', 'repositories'],
		'Get repository metadata.',
	),
	registerRemoteTool(
		options,
		'repositories_search',
		'Search repositories with an explicit limit.',
		z
			.object({
				query: z.string().min(1),
				owner: z.string().min(1).optional(),
				...pagingSchema.shape,
			})
			.strict(),
		envelopeSchema(
			pagedCollectionSchema('repositories', repositorySchema).extend({
				totalCount: z.number().int().nullable(),
			}),
		),
		async (args) => {
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: '/search/repositories',
				query: {
					q: args.owner ? `${args.owner} ${args.query}` : args.query,
					...queryFrom({ page: args.page, perPage }),
				},
				responseSchema: z.record(z.string(), z.unknown()),
			});
			const payload = asRecord(result.data);
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					repositories: asArray(payload.items).map(mapRepository),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
					nextPage: result.meta.pagination?.nextPage ?? null,
					totalCount: asNumber(payload.total_count) ?? null,
				},
				meta: result.meta,
			};
		},
		['github', 'repositories', 'search'],
		'Search repositories.',
	),
	registerRemoteTool(
		options,
		'repositories_variables',
		'List repository variable metadata without values.',
		repoSelectorSchema.extend(pagingSchema.shape).strict(),
		envelopeSchema(pagedCollectionSchema('variables', variableSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/actions/variables`,
				query: queryFrom({ page: args.page, perPage }),
				responseSchema: z.record(z.string(), z.unknown()),
			});
			const payload = asRecord(result.data);
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					variables: asArray(payload.variables).map(mapVariable),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
					nextPage: result.meta.pagination?.nextPage ?? null,
				},
				meta: result.meta,
			};
		},
		['github', 'repositories', 'variables'],
		'List repository variable metadata.',
	),
];

export const buildGitHubIssuesToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'issues_list',
		'List issues with explicit paging.',
		repoSelectorSchema
			.extend({
				state: z.enum(['open', 'closed', 'all']).optional(),
				labels: z.array(z.string()).optional(),
				...pagingSchema.shape,
			})
			.strict(),
		envelopeSchema(pagedCollectionSchema('issues', issueSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/issues`,
				query: {
					state: args.state ?? 'open',
					labels: args.labels?.join(','),
					...queryFrom({ page: args.page, perPage }),
				},
				responseSchema: z.array(z.record(z.string(), z.unknown())),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					issues: asArray(result.data)
						.filter(
							(issue) =>
								asRecord(issue).pull_request === undefined,
						)
						.map(mapIssue),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
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
		'Show one issue with its comments.',
		repoSelectorSchema
			.extend({
				issue: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
			})
			.strict(),
		envelopeSchema(
			z
				.object({
					issue: issueSchema.extend({
						comments: z.array(commentSchema),
					}),
				})
				.strict(),
		),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const issueNumber = String(args.issue);
			const [issueResult, commentsResult] = await Promise.all([
				options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/issues/${issueNumber}`,
					responseSchema: z.record(z.string(), z.unknown()),
				}),
				options.client.request({
					path: `/repos/${repo.owner}/${repo.repository}/issues/${issueNumber}/comments`,
					query: { per_page: 100, page: 1 },
					responseSchema: z.array(z.record(z.string(), z.unknown())),
				}),
			]);
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					issue: {
						...mapIssue(issueResult.data),
						comments: asArray(commentsResult.data).map(
							(comment) => ({
								author: mapUser(asRecord(comment).user),
								body: asString(asRecord(comment).body) ?? '',
								createdAt: asString(
									asRecord(comment).created_at,
								),
								url: asString(asRecord(comment).html_url),
							}),
						),
					},
				},
				meta: commentsResult.meta,
			};
		},
		['github', 'issues'],
		'Show an issue with comments.',
	),
];

export const buildGitHubPullRequestsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'pull_requests_list',
		'List pull requests with explicit paging.',
		repoSelectorSchema
			.extend({
				state: z.enum(['open', 'closed', 'all']).optional(),
				...pagingSchema.shape,
			})
			.strict(),
		envelopeSchema(
			pagedCollectionSchema('pullRequests', pullRequestSchema),
		),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/pulls`,
				query: {
					state: args.state ?? 'open',
					...queryFrom({ page: args.page, perPage }),
				},
				responseSchema: z.array(z.record(z.string(), z.unknown())),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					pullRequests: asArray(result.data).map(mapPullRequest),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
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
		repoSelectorSchema
			.extend({
				pr: z.union([z.string().min(1), z.number().int().positive()]),
			})
			.strict(),
		envelopeSchema(z.object({ pullRequest: pullRequestSchema }).strict()),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const prNumber = String(args.pr);
			const [prResult, commentsResult, reviewsResult] = await Promise.all(
				[
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
				],
			);
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					pullRequest: {
						...mapPullRequest(prResult.data),
						comments: asArray(commentsResult.data).map(
							(comment) => ({
								author: mapUser(asRecord(comment).user),
								body: asString(asRecord(comment).body) ?? '',
								createdAt: asString(
									asRecord(comment).created_at,
								),
								url: asString(asRecord(comment).html_url),
							}),
						),
						reviews: asArray(reviewsResult.data).map((review) => ({
							author: mapUser(asRecord(review).user),
							state:
								asString(asRecord(review).state) ?? 'unknown',
							body: asString(asRecord(review).body),
							submittedAt: asString(
								asRecord(review).submitted_at,
							),
							url: asString(asRecord(review).html_url),
						})),
					},
				},
				meta: prResult.meta,
			};
		},
		['github', 'pull-requests'],
		'Show a pull request with comments and reviews.',
	),
];

export const buildGitHubCommitsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'commits_list',
		'List commits with explicit paging.',
		repoSelectorSchema
			.extend({
				sha: z.string().min(1).optional(),
				...pagingSchema.shape,
			})
			.strict(),
		envelopeSchema(pagedCollectionSchema('commits', commitSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/commits`,
				query: {
					sha: args.sha,
					...queryFrom({ page: args.page, perPage }),
				},
				responseSchema: z.array(z.record(z.string(), z.unknown())),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					commits: asArray(result.data).map(mapCommit),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
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
		'Show one commit with statuses, checks and files.',
		repoSelectorSchema.extend({ sha: z.string().min(1) }).strict(),
		envelopeSchema(commitSchema),
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
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					...mapCommit(commitResult.data),
					statuses: asArray(asRecord(statusResult.data).statuses).map(
						(status) => ({
							context: asString(asRecord(status).context),
							state:
								asString(asRecord(status).state) ?? 'unknown',
							description: asString(asRecord(status).description),
							targetUrl: asString(asRecord(status).target_url),
						}),
					),
					checkRuns: asArray(
						asRecord(checkRunsResult.data).check_runs,
					).map((checkRun) => ({
						id: asNumber(asRecord(checkRun).id) ?? 0,
						name: asString(asRecord(checkRun).name) ?? '',
						status:
							asString(asRecord(checkRun).status) ?? 'unknown',
						conclusion: asString(asRecord(checkRun).conclusion),
						detailsUrl: asString(asRecord(checkRun).details_url),
						startedAt: asString(asRecord(checkRun).started_at),
						completedAt: asString(asRecord(checkRun).completed_at),
					})),
				},
				meta: commitResult.meta,
			};
		},
		['github', 'commits'],
		'Show a commit.',
	),
	registerRemoteTool(
		options,
		'commit_statuses',
		'Show combined commit statuses.',
		repoSelectorSchema.extend({ sha: z.string().min(1) }).strict(),
		envelopeSchema(
			z
				.object({
					commit: z
						.object({
							sha: z.string(),
							statuses: z.array(statusSchema),
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
						statuses: asArray(asRecord(result.data).statuses).map(
							(status) => ({
								context: asString(asRecord(status).context),
								state:
									asString(asRecord(status).state) ??
									'unknown',
								description: asString(
									asRecord(status).description,
								),
								targetUrl: asString(
									asRecord(status).target_url,
								),
							}),
						),
					},
				},
				meta: result.meta,
			};
		},
		['github', 'checks'],
		'Show commit statuses.',
	),
];

export const buildGitHubChecksToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'checks_runs',
		'List check runs for a commit or branch ref.',
		repoSelectorSchema
			.extend({ ref: z.string().min(1), ...pagingSchema.shape })
			.strict(),
		envelopeSchema(pagedCollectionSchema('checkRuns', checkRunSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/commits/${args.ref}/check-runs`,
				query: queryFrom({
					page: args.page,
					perPage,
				}),
				responseSchema: z.record(z.string(), z.unknown()),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					checkRuns: asArray(asRecord(result.data).check_runs).map(
						(checkRun) => ({
							id: asNumber(asRecord(checkRun).id) ?? 0,
							name: asString(asRecord(checkRun).name) ?? '',
							status:
								asString(asRecord(checkRun).status) ??
								'unknown',
							conclusion: asString(asRecord(checkRun).conclusion),
							detailsUrl: asString(
								asRecord(checkRun).details_url,
							),
							startedAt: asString(asRecord(checkRun).started_at),
							completedAt: asString(
								asRecord(checkRun).completed_at,
							),
						}),
					),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
					nextPage: result.meta.pagination?.nextPage ?? null,
				},
				meta: result.meta,
			};
		},
		['github', 'checks'],
		'List check runs.',
	),
];

export const buildGitHubWorkflowsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'workflows_list',
		'List workflow definitions.',
		repoSelectorSchema.extend(pagingSchema.shape).strict(),
		envelopeSchema(pagedCollectionSchema('workflows', workflowSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/actions/workflows`,
				query: queryFrom({ page: args.page, perPage }),
				responseSchema: z.record(z.string(), z.unknown()),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					workflows: asArray(asRecord(result.data).workflows).map(
						mapWorkflow,
					),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
					nextPage: result.meta.pagination?.nextPage ?? null,
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
		repoSelectorSchema
			.extend({
				workflowId: z
					.union([z.string().min(1), z.number().int().positive()])
					.optional(),
				branch: z.string().optional(),
				status: z.string().optional(),
				...pagingSchema.shape,
			})
			.strict(),
		envelopeSchema(pagedCollectionSchema('runs', workflowRunSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const path =
				args.workflowId !== undefined
					? `/repos/${repo.owner}/${repo.repository}/actions/workflows/${args.workflowId}/runs`
					: `/repos/${repo.owner}/${repo.repository}/actions/runs`;
			const result = await options.client.request({
				path,
				query: {
					branch: args.branch,
					status: args.status,
					...queryFrom({
						page: args.page,
						perPage,
					}),
				},
				responseSchema: z.record(z.string(), z.unknown()),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					runs: asArray(asRecord(result.data).workflow_runs).map(
						mapWorkflowRun,
					),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
					nextPage: result.meta.pagination?.nextPage ?? null,
				},
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
		repoSelectorSchema
			.extend({
				runId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
			})
			.strict(),
		envelopeSchema(z.object({ run: workflowRunSchema }).strict()),
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
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					run: {
						...mapWorkflowRun(runResult.data),
						jobs: asArray(asRecord(jobsResult.data).jobs).map(
							mapJob,
						),
					},
				},
				meta: runResult.meta,
			};
		},
		['github', 'workflows', 'jobs'],
		'Show a workflow run.',
	),
];

export const buildGitHubJobsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'jobs_list',
		'List jobs for a workflow run.',
		repoSelectorSchema
			.extend({
				runId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
				...pagingSchema.shape,
			})
			.strict(),
		envelopeSchema(pagedCollectionSchema('jobs', jobSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/actions/runs/${args.runId}/jobs`,
				query: queryFrom({ page: args.page, perPage }),
				responseSchema: z.record(z.string(), z.unknown()),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					jobs: asArray(asRecord(result.data).jobs).map(mapJob),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
					nextPage: result.meta.pagination?.nextPage ?? null,
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
		'Fetch job logs with truncation and optional local persistence.',
		repoSelectorSchema
			.extend({
				jobId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
				maxBytes: z.number().int().positive().max(1_000_000).optional(),
				maxLines: z.number().int().positive().max(100_000).optional(),
				maxMs: z.number().int().positive().max(60_000).optional(),
				persist: z.boolean().optional(),
			})
			.strict(),
		envelopeSchema(
			z
				.object({
					log: z.string(),
					logPath: z.string().optional(),
					truncation: z
						.object({
							truncated: z.boolean(),
							reason: z
								.enum([
									'byte-limit',
									'line-limit',
									'time-limit',
								])
								.nullable(),
							originalBytes: z.number().int(),
							keptBytes: z.number().int(),
							originalLines: z.number().int(),
							keptLines: z.number().int(),
						})
						.strict(),
				})
				.strict(),
		),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/actions/jobs/${args.jobId}/logs`,
				parseAs: 'text',
			});
			const log = typeof result.data === 'string' ? result.data : '';
			const lines = log === '' ? [] : log.split(/\r?\n/);
			let trimmed = log;
			let reason: 'byte-limit' | 'line-limit' | 'time-limit' | null =
				null;
			if (args.maxLines !== undefined && lines.length > args.maxLines) {
				trimmed = lines.slice(0, args.maxLines).join('\n');
				reason = 'line-limit';
			}
			if (args.maxBytes !== undefined) {
				while (Buffer.byteLength(trimmed, 'utf8') > args.maxBytes) {
					trimmed = trimmed.slice(0, -1);
					reason = 'byte-limit';
					if (trimmed.length === 0) break;
				}
			}
			if (args.maxMs !== undefined && args.maxMs <= 1)
				reason = 'time-limit';
			let logPath: string | undefined;
			if (args.persist === true && options.pluginCacheDir !== undefined) {
				logPath = await writeJsonWithinCache(
					cacheRoot(options),
					`jobs/${String(args.jobId)}.json`,
					{ log: trimmed, truncated: reason !== null, reason },
				);
			}
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					log: trimmed,
					...(logPath !== undefined ? { logPath } : {}),
					truncation: {
						truncated: reason !== null,
						reason,
						originalBytes: Buffer.byteLength(log, 'utf8'),
						keptBytes: Buffer.byteLength(trimmed, 'utf8'),
						originalLines: lines.length,
						keptLines:
							trimmed === '' ? 0 : trimmed.split(/\r?\n/).length,
					},
				},
				meta: result.meta,
			};
		},
		['github', 'jobs', 'logs'],
		'Fetch truncated job logs.',
	),
];

export const buildGitHubArtifactsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'artifacts_list',
		'List workflow artifacts and optionally persist a local snapshot.',
		repoSelectorSchema
			.extend({
				runId: z
					.union([z.string().min(1), z.number().int().positive()])
					.optional(),
				...pagingSchema.shape,
				persistSnapshot: z.boolean().optional(),
			})
			.strict(),
		envelopeSchema(
			pagedCollectionSchema('artifacts', artifactSchema).extend({
				snapshotPath: z.string().optional(),
			}),
		),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const path =
				args.runId !== undefined
					? `/repos/${repo.owner}/${repo.repository}/actions/runs/${args.runId}/artifacts`
					: `/repos/${repo.owner}/${repo.repository}/actions/artifacts`;
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path,
				query: queryFrom({ page: args.page, perPage }),
				responseSchema: z.record(z.string(), z.unknown()),
			});
			const artifacts = asArray(asRecord(result.data).artifacts).map(
				mapArtifact,
			);
			let snapshotPath: string | undefined;
			if (
				args.persistSnapshot === true &&
				options.pluginCacheDir !== undefined
			) {
				snapshotPath = await writeJsonWithinCache(
					cacheRoot(options),
					`artifacts/${String(args.runId ?? 'repo')}.json`,
					{ artifacts },
				);
			}
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					artifacts,
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
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

export const buildGitHubReleasesToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'releases_list',
		'List releases with explicit paging.',
		repoSelectorSchema.extend(pagingSchema.shape).strict(),
		envelopeSchema(pagedCollectionSchema('releases', releaseSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/releases`,
				query: queryFrom({ page: args.page, perPage }),
				responseSchema: z.array(z.record(z.string(), z.unknown())),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					releases: asArray(result.data).map(mapRelease),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
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
		repoSelectorSchema
			.extend({
				releaseId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
			})
			.strict(),
		envelopeSchema(z.object({ release: releaseSchema }).strict()),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/releases/${args.releaseId}`,
				responseSchema: z.record(z.string(), z.unknown()),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: { release: mapRelease(result.data) },
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
		repoSelectorSchema.extend(pagingSchema.shape).strict(),
		envelopeSchema(pagedCollectionSchema('tags', tagSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/tags`,
				query: queryFrom({ page: args.page, perPage }),
				responseSchema: z.array(z.record(z.string(), z.unknown())),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					tags: asArray(result.data).map(mapTag),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
					nextPage: result.meta.pagination?.nextPage ?? null,
				},
				meta: result.meta,
			};
		},
		['github', 'tags'],
		'List tags.',
	),
];

export const buildGitHubDeploymentsToolRegistrations = (
	options: IGitHubToolOptions,
): readonly IToolRegistration[] => [
	registerRemoteTool(
		options,
		'deployments_list',
		'List deployments.',
		repoSelectorSchema.extend(pagingSchema.shape).strict(),
		envelopeSchema(pagedCollectionSchema('deployments', deploymentSchema)),
		async (args) => {
			const repo = resolveRepo(options.context, args);
			const perPage = args.perPage ?? args.limit ?? 20;
			const result = await options.client.request({
				path: `/repos/${repo.owner}/${repo.repository}/deployments`,
				query: queryFrom({ page: args.page, perPage }),
				responseSchema: z.array(z.record(z.string(), z.unknown())),
			});
			return {
				ok: true as const,
				provider: 'github' as const,
				data: {
					deployments: asArray(result.data).map(mapDeployment),
					page: result.meta.pagination?.page ?? args.page ?? 1,
					perPage: result.meta.pagination?.perPage ?? perPage,
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
		repoSelectorSchema
			.extend({
				deploymentId: z.union([
					z.string().min(1),
					z.number().int().positive(),
				]),
			})
			.strict(),
		envelopeSchema(
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
		),
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
					statuses: asArray(result.data).map((status) => ({
						state: asString(asRecord(status).state) ?? 'unknown',
						description: asString(asRecord(status).description),
						environmentUrl: asString(
							asRecord(status).environment_url,
						),
						createdAt: asString(asRecord(status).created_at),
					})),
				},
				meta: result.meta,
			};
		},
		['github', 'deployments'],
		'List deployment statuses.',
	),
];

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
