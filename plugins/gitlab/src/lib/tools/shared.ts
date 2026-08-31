import { mkdir } from 'node:fs/promises';
import { isAbsolute, join, resolve as resolvePath, sep } from 'node:path';
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import type { GitLabRequestError } from '../client';
import type { IGitLabProviderContext } from '../config';
import type { createGitLabHttpClient } from '../client';

const OBJECT_SCHEMA = z.object({}).passthrough();
const ARRAY_SCHEMA = z.array(OBJECT_SCHEMA);

const NON_EMPTY = z.string().min(1);

export const paginationSchema = z
	.object({
		page: z.number().int().nullable(),
		perPage: z.number().int().nullable(),
		nextPage: z.union([z.string(), z.null()]),
		previousPage: z.union([z.string(), z.null()]),
		total: z.number().int().nullable(),
		totalPages: z.number().int().nullable(),
		hasMore: z.boolean(),
	})
	.nullable();

export const rateLimitSchema = z
	.object({
		limit: z.number().int().nullable(),
		remaining: z.number().int().nullable(),
		resetAt: z.string().nullable(),
		retryAfterSeconds: z.number().nullable(),
		scope: z.string(),
		source: z.string(),
	})
	.nullable();

export const responseMetaSchema = z.object({
	status: z.number().int(),
	requestId: z.string().nullable(),
	durationMs: z.number().nonnegative(),
	attempts: z.number().int().positive(),
	pagination: paginationSchema,
	rateLimit: rateLimitSchema,
	truncated: z
		.object({
			truncated: z.boolean(),
			reason: z.string().nullable(),
			originalBytes: z.number().nullable(),
			keptBytes: z.number().nullable(),
			originalLines: z.number().nullable(),
			keptLines: z.number().nullable(),
		})
		.nullable(),
});

export const userSchema = z.object({
	name: z.string(),
	username: z.string(),
	webUrl: z.string().url().nullable(),
});

export const projectSchema = z.object({
	id: z.union([z.number(), z.string()]),
	path: z.string(),
	pathWithNamespace: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	webUrl: z.string().url(),
	visibility: z.string(),
	archived: z.boolean(),
	defaultBranch: z.string().nullable(),
	topics: z.array(z.string()),
	namespace: z
		.object({
			id: z.union([z.number(), z.string()]).nullable(),
			fullPath: z.string().nullable(),
			kind: z.string().nullable(),
			name: z.string().nullable(),
		})
		.nullable(),
});

export const variableSchema = z.object({
	key: z.string(),
	environmentScope: z.string(),
	masked: z.boolean(),
	protected: z.boolean(),
	hidden: z.boolean().nullable(),
	raw: z.boolean().nullable(),
	variableType: z.string().nullable(),
});

export const noteSchema = z.object({
	id: z.union([z.number(), z.string()]),
	body: z.string(),
	createdAt: z.string().nullable(),
	updatedAt: z.string().nullable(),
	system: z.boolean(),
	author: userSchema.nullable(),
});

export const discussionSchema = z.object({
	id: z.string(),
	individualNote: z.boolean(),
	notes: z.array(noteSchema),
});

export const issueSchema = z.object({
	id: z.union([z.number(), z.string()]),
	iid: z.union([z.number(), z.string()]),
	title: z.string(),
	state: z.string(),
	webUrl: z.string().url(),
	createdAt: z.string().nullable(),
	updatedAt: z.string().nullable(),
	closedAt: z.string().nullable(),
	description: z.string().nullable(),
	labels: z.array(z.string()),
	confidential: z.boolean(),
	author: userSchema.nullable(),
	milestone: z.string().nullable(),
});

export const mergeRequestSchema = z.object({
	id: z.union([z.number(), z.string()]),
	iid: z.union([z.number(), z.string()]),
	title: z.string(),
	state: z.string(),
	webUrl: z.string().url(),
	createdAt: z.string().nullable(),
	updatedAt: z.string().nullable(),
	mergedAt: z.string().nullable(),
	description: z.string().nullable(),
	labels: z.array(z.string()),
	draft: z.boolean(),
	workInProgress: z.boolean(),
	mergeStatus: z.string().nullable(),
	shouldRemoveSourceBranch: z.boolean().nullable(),
	sourceBranch: z.string().nullable(),
	targetBranch: z.string().nullable(),
	author: userSchema.nullable(),
});

export const commitSchema = z.object({
	id: z.string(),
	shortId: z.string().nullable(),
	title: z.string(),
	message: z.string().nullable(),
	createdAt: z.string().nullable(),
	committedDate: z.string().nullable(),
	authoredDate: z.string().nullable(),
	webUrl: z.string().url().nullable(),
	parentIds: z.array(z.string()),
	authorName: z.string().nullable(),
	authorEmail: z.string().nullable(),
	stats: z
		.object({
			additions: z.number().int().nullable(),
			deletions: z.number().int().nullable(),
			total: z.number().int().nullable(),
		})
		.nullable(),
});

export const pipelineSchema = z.object({
	id: z.union([z.number(), z.string()]),
	status: z.string(),
	source: z.string().nullable(),
	ref: z.string().nullable(),
	sha: z.string().nullable(),
	webUrl: z.string().url().nullable(),
	createdAt: z.string().nullable(),
	updatedAt: z.string().nullable(),
	duration: z.number().nullable(),
	user: userSchema.nullable(),
});

export const jobSchema = z.object({
	id: z.union([z.number(), z.string()]),
	name: z.string(),
	stage: z.string().nullable(),
	status: z.string(),
	webUrl: z.string().url().nullable(),
	createdAt: z.string().nullable(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
	duration: z.number().nullable(),
	failureReason: z.string().nullable(),
	allowFailure: z.boolean().nullable(),
	artifacts: z.array(z.object({}).passthrough()),
});

export const releaseSchema = z.object({
	tagName: z.string(),
	name: z.string().nullable(),
	webUrl: z.string().url().nullable(),
	releasedAt: z.string().nullable(),
	description: z.string().nullable(),
});

export const tagSchema = z.object({
	name: z.string(),
	target: z.string().nullable(),
	commit: z
		.object({
			id: z.string().nullable(),
			shortId: z.string().nullable(),
			title: z.string().nullable(),
		})
		.nullable(),
	release: releaseSchema.nullable(),
	webUrl: z.string().url().nullable(),
});

export const deploymentSchema = z.object({
	id: z.union([z.number(), z.string()]),
	environment: z
		.object({
			id: z.union([z.number(), z.string()]).nullable(),
			name: z.string().nullable(),
			slug: z.string().nullable(),
		})
		.nullable(),
	status: z.string(),
	sha: z.string().nullable(),
	ref: z.string().nullable(),
	webUrl: z.string().url().nullable(),
	createdAt: z.string().nullable(),
	updatedAt: z.string().nullable(),
});

export const compareSchema = z.object({
	commitCount: z.number().int().nullable(),
	headCommit: z.object({}).passthrough().nullable(),
	baseCommit: z.object({}).passthrough().nullable(),
	commits: z.array(z.object({}).passthrough()),
	diffs: z.array(z.object({}).passthrough()),
});

export const artifactSchema = z.object({
	fileType: z.string().nullable(),
	fileFormat: z.string().nullable(),
	filename: z.string().nullable(),
	size: z.number().nullable(),
});

export interface IGitLabToolSuiteOptions {
	readonly namespacePrefix: string;
	readonly context: IGitLabProviderContext;
	readonly client: ReturnType<typeof createGitLabHttpClient>;
	readonly pluginTempDir: string;
}

const toText = (value: unknown): string =>
	typeof value === 'string' ? value : '';

const toNonEmpty = (value: unknown): string | undefined => {
	const text = toText(value).trim();
	return text.length > 0 ? text : undefined;
};

const toNumber = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

const toId = (value: unknown): string | number | null => {
	if (typeof value === 'string') return value.length > 0 ? value : null;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return null;
};

const toBoolean = (value: unknown): boolean => value === true;

const toArray = (value: unknown): readonly unknown[] =>
	Array.isArray(value) ? value : [];

const truncateText = (value: unknown, maxChars: number): string | null => {
	const text = toNonEmpty(value);
	if (text === undefined) return null;
	return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
};

const truncateUtf8Bytes = (value: string, maxBytes: number): string => {
	let kept = '';
	let usedBytes = 0;
	for (const symbol of value) {
		const symbolBytes = Buffer.byteLength(symbol, 'utf8');
		if (usedBytes + symbolBytes > maxBytes) break;
		kept += symbol;
		usedBytes += symbolBytes;
	}
	return kept;
};

const sanitizeArtifactFileName = (value: string): string => {
	const sanitized = value
		.replace(/[^a-zA-Z0-9._-]+/g, '_')
		.replace(/\.{2,}/g, '_')
		.replace(/^\.+/, '');
	return sanitized.length > 0 ? sanitized : 'artifact.zip';
};

const normalizeUser = (value: unknown): z.infer<typeof userSchema> | null => {
	const raw = value as Record<string, unknown> | null;
	if (raw === null || typeof raw !== 'object') return null;
	const username = toNonEmpty(raw.username) ?? toNonEmpty(raw.login);
	const name = toNonEmpty(raw.name) ?? username;
	if (username === undefined || name === undefined) return null;
	const webUrl = toNonEmpty(raw.web_url) ?? toNonEmpty(raw.webUrl);
	return {
		name,
		username,
		webUrl: webUrl ?? null,
	};
};

const normalizeProject = (value: unknown): z.infer<typeof projectSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		id: raw.id as number | string,
		path: toNonEmpty(raw.path) ?? toNonEmpty(raw.name) ?? '',
		pathWithNamespace:
			toNonEmpty(raw.path_with_namespace) ??
			toNonEmpty(raw.full_path) ??
			'',
		name: toNonEmpty(raw.name) ?? '',
		description: truncateText(raw.description, 600),
		webUrl: toNonEmpty(raw.web_url) ?? toNonEmpty(raw.webUrl) ?? '',
		visibility: toNonEmpty(raw.visibility) ?? 'private',
		archived: toBoolean(raw.archived),
		defaultBranch:
			toNonEmpty(raw.default_branch) ??
			toNonEmpty(raw.defaultBranch) ??
			null,
		topics: toArray(raw.topics)
			.map((topic) => toNonEmpty(topic))
			.filter((topic): topic is string => topic !== undefined),
		namespace:
			raw.namespace && typeof raw.namespace === 'object'
				? {
						id: toId((raw.namespace as Record<string, unknown>).id),
						fullPath:
							toNonEmpty(
								(raw.namespace as Record<string, unknown>)
									.full_path,
							) ??
							toNonEmpty(
								(raw.namespace as Record<string, unknown>)
									.fullPath,
							) ??
							null,
						kind:
							toNonEmpty(
								(raw.namespace as Record<string, unknown>).kind,
							) ?? null,
						name:
							toNonEmpty(
								(raw.namespace as Record<string, unknown>).name,
							) ?? null,
					}
				: null,
	};
};

const normalizeVariable = (value: unknown): z.infer<typeof variableSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		key: toNonEmpty(raw.key) ?? '',
		environmentScope:
			toNonEmpty(raw.environment_scope) ??
			toNonEmpty(raw.environmentScope) ??
			'*',
		masked: toBoolean(raw.masked),
		protected: toBoolean(raw.protected),
		hidden: typeof raw.hidden === 'boolean' ? raw.hidden : null,
		raw: typeof raw.raw === 'boolean' ? raw.raw : null,
		variableType:
			toNonEmpty(raw.variable_type) ??
			toNonEmpty(raw.variableType) ??
			null,
	};
};

export const normalizeNote = (value: unknown): z.infer<typeof noteSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		id: raw.id as number | string,
		body: truncateText(raw.body, 800) ?? '',
		createdAt:
			toNonEmpty(raw.created_at) ?? toNonEmpty(raw.createdAt) ?? null,
		updatedAt:
			toNonEmpty(raw.updated_at) ?? toNonEmpty(raw.updatedAt) ?? null,
		system: toBoolean(raw.system),
		author: normalizeUser(raw.author),
	};
};

export const normalizeDiscussion = (
	value: unknown,
): z.infer<typeof discussionSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		id: toNonEmpty(raw.id) ?? '',
		individualNote:
			toBoolean(raw.individual_note) || toBoolean(raw.individualNote),
		notes: toArray(raw.notes).map((note) => normalizeNote(note)),
	};
};

export const normalizeIssue = (value: unknown): z.infer<typeof issueSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		id: raw.id as number | string,
		iid: raw.iid as number | string,
		title: toNonEmpty(raw.title) ?? '',
		state: toNonEmpty(raw.state) ?? '',
		webUrl: toNonEmpty(raw.web_url) ?? toNonEmpty(raw.webUrl) ?? '',
		createdAt:
			toNonEmpty(raw.created_at) ?? toNonEmpty(raw.createdAt) ?? null,
		updatedAt:
			toNonEmpty(raw.updated_at) ?? toNonEmpty(raw.updatedAt) ?? null,
		closedAt: toNonEmpty(raw.closed_at) ?? toNonEmpty(raw.closedAt) ?? null,
		description: truncateText(raw.description, 1200),
		labels: toArray(raw.labels)
			.map((label) => toNonEmpty(label))
			.filter((label): label is string => label !== undefined),
		confidential: toBoolean(raw.confidential),
		author: normalizeUser(raw.author),
		milestone:
			toNonEmpty(
				raw.milestone && typeof raw.milestone === 'object'
					? (raw.milestone as Record<string, unknown>).title
					: undefined,
			) ?? null,
	};
};

const normalizeMergeRequest = (
	value: unknown,
): z.infer<typeof mergeRequestSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		id: raw.id as number | string,
		iid: raw.iid as number | string,
		title: toNonEmpty(raw.title) ?? '',
		state: toNonEmpty(raw.state) ?? '',
		webUrl: toNonEmpty(raw.web_url) ?? toNonEmpty(raw.webUrl) ?? '',
		createdAt:
			toNonEmpty(raw.created_at) ?? toNonEmpty(raw.createdAt) ?? null,
		updatedAt:
			toNonEmpty(raw.updated_at) ?? toNonEmpty(raw.updatedAt) ?? null,
		mergedAt: toNonEmpty(raw.merged_at) ?? toNonEmpty(raw.mergedAt) ?? null,
		description: truncateText(raw.description, 1200),
		labels: toArray(raw.labels)
			.map((label) => toNonEmpty(label))
			.filter((label): label is string => label !== undefined),
		draft: toBoolean(raw.draft),
		workInProgress:
			toBoolean(raw.work_in_progress) || toBoolean(raw.workInProgress),
		mergeStatus:
			toNonEmpty(raw.merge_status) ?? toNonEmpty(raw.mergeStatus) ?? null,
		shouldRemoveSourceBranch:
			typeof raw.should_remove_source_branch === 'boolean'
				? raw.should_remove_source_branch
				: typeof raw.shouldRemoveSourceBranch === 'boolean'
					? raw.shouldRemoveSourceBranch
					: null,
		sourceBranch:
			toNonEmpty(raw.source_branch) ??
			toNonEmpty(raw.sourceBranch) ??
			null,
		targetBranch:
			toNonEmpty(raw.target_branch) ??
			toNonEmpty(raw.targetBranch) ??
			null,
		author: normalizeUser(raw.author),
	};
};

const normalizeCommit = (value: unknown): z.infer<typeof commitSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		id: toNonEmpty(raw.id) ?? '',
		shortId: toNonEmpty(raw.short_id) ?? toNonEmpty(raw.shortId) ?? null,
		title: toNonEmpty(raw.title) ?? '',
		message: truncateText(raw.message, 1200),
		createdAt:
			toNonEmpty(raw.created_at) ?? toNonEmpty(raw.createdAt) ?? null,
		committedDate:
			toNonEmpty(raw.committed_date) ??
			toNonEmpty(raw.committedDate) ??
			null,
		authoredDate:
			toNonEmpty(raw.authored_date) ??
			toNonEmpty(raw.authoredDate) ??
			null,
		webUrl: toNonEmpty(raw.web_url) ?? toNonEmpty(raw.webUrl) ?? null,
		parentIds: toArray(raw.parent_ids)
			.map((id) => toNonEmpty(id))
			.filter((id): id is string => id !== undefined),
		authorName:
			toNonEmpty(raw.author_name) ?? toNonEmpty(raw.authorName) ?? null,
		authorEmail:
			toNonEmpty(raw.author_email) ?? toNonEmpty(raw.authorEmail) ?? null,
		stats:
			raw.stats && typeof raw.stats === 'object'
				? {
						additions: toNumber(
							(raw.stats as Record<string, unknown>).additions,
						),
						deletions: toNumber(
							(raw.stats as Record<string, unknown>).deletions,
						),
						total: toNumber(
							(raw.stats as Record<string, unknown>).total,
						),
					}
				: null,
	};
};

export const normalizePipeline = (
	value: unknown,
): z.infer<typeof pipelineSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		id: raw.id as number | string,
		status: toNonEmpty(raw.status) ?? '',
		source: toNonEmpty(raw.source) ?? null,
		ref: toNonEmpty(raw.ref) ?? null,
		sha: toNonEmpty(raw.sha) ?? null,
		webUrl: toNonEmpty(raw.web_url) ?? toNonEmpty(raw.webUrl) ?? null,
		createdAt:
			toNonEmpty(raw.created_at) ?? toNonEmpty(raw.createdAt) ?? null,
		updatedAt:
			toNonEmpty(raw.updated_at) ?? toNonEmpty(raw.updatedAt) ?? null,
		duration: toNumber(raw.duration),
		user: normalizeUser(raw.user),
	};
};

export const normalizeJob = (value: unknown): z.infer<typeof jobSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		id: raw.id as number | string,
		name: toNonEmpty(raw.name) ?? '',
		stage: toNonEmpty(raw.stage) ?? null,
		status: toNonEmpty(raw.status) ?? '',
		webUrl: toNonEmpty(raw.web_url) ?? toNonEmpty(raw.webUrl) ?? null,
		createdAt:
			toNonEmpty(raw.created_at) ?? toNonEmpty(raw.createdAt) ?? null,
		startedAt:
			toNonEmpty(raw.started_at) ?? toNonEmpty(raw.startedAt) ?? null,
		finishedAt:
			toNonEmpty(raw.finished_at) ?? toNonEmpty(raw.finishedAt) ?? null,
		duration: toNumber(raw.duration),
		failureReason:
			toNonEmpty(raw.failure_reason) ??
			toNonEmpty(raw.failureReason) ??
			null,
		allowFailure:
			typeof raw.allow_failure === 'boolean'
				? raw.allow_failure
				: typeof raw.allowFailure === 'boolean'
					? raw.allowFailure
					: null,
		artifacts: toArray(raw.artifacts).map(
			(artifact) => artifact as Record<string, unknown>,
		),
	};
};

export const normalizeRelease = (
	value: unknown,
): z.infer<typeof releaseSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		tagName: toNonEmpty(raw.tag_name) ?? toNonEmpty(raw.tagName) ?? '',
		name: toNonEmpty(raw.name) ?? null,
		webUrl:
			toNonEmpty(
				raw._links && typeof raw._links === 'object'
					? (raw._links as Record<string, unknown>).self
					: undefined,
			) ??
			toNonEmpty(raw.web_url) ??
			toNonEmpty(raw.webUrl) ??
			null,
		releasedAt:
			toNonEmpty(raw.released_at) ?? toNonEmpty(raw.releasedAt) ?? null,
		description: truncateText(raw.description, 1200),
	};
};

export const normalizeTag = (value: unknown): z.infer<typeof tagSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		name: toNonEmpty(raw.name) ?? '',
		target: toNonEmpty(raw.target) ?? null,
		commit:
			raw.commit && typeof raw.commit === 'object'
				? {
						id:
							toNonEmpty(
								(raw.commit as Record<string, unknown>).id,
							) ?? null,
						shortId:
							toNonEmpty(
								(raw.commit as Record<string, unknown>)
									.short_id,
							) ??
							toNonEmpty(
								(raw.commit as Record<string, unknown>).shortId,
							) ??
							null,
						title:
							toNonEmpty(
								(raw.commit as Record<string, unknown>).title,
							) ?? null,
					}
				: null,
		release:
			raw.release && typeof raw.release === 'object'
				? normalizeRelease(raw.release)
				: null,
		webUrl: toNonEmpty(raw.web_url) ?? toNonEmpty(raw.webUrl) ?? null,
	};
};

const normalizeDeployment = (
	value: unknown,
): z.infer<typeof deploymentSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		id: raw.id as number | string,
		environment:
			raw.environment && typeof raw.environment === 'object'
				? {
						id: toId(
							(raw.environment as Record<string, unknown>).id,
						),
						name:
							toNonEmpty(
								(raw.environment as Record<string, unknown>)
									.name,
							) ?? null,
						slug:
							toNonEmpty(
								(raw.environment as Record<string, unknown>)
									.slug,
							) ?? null,
					}
				: null,
		status: toNonEmpty(raw.status) ?? '',
		sha: toNonEmpty(raw.sha) ?? null,
		ref: toNonEmpty(raw.ref) ?? null,
		webUrl: toNonEmpty(raw.web_url) ?? toNonEmpty(raw.webUrl) ?? null,
		createdAt:
			toNonEmpty(raw.created_at) ?? toNonEmpty(raw.createdAt) ?? null,
		updatedAt:
			toNonEmpty(raw.updated_at) ?? toNonEmpty(raw.updatedAt) ?? null,
	};
};

const normalizeCompare = (value: unknown): z.infer<typeof compareSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		commitCount: toNumber(raw.commit_count) ?? toNumber(raw.commitCount),
		headCommit:
			raw.commit && typeof raw.commit === 'object'
				? (raw.commit as Record<string, unknown>)
				: null,
		baseCommit:
			raw.compare_timeout !== undefined && raw.compare_timeout !== null
				? null
				: ((raw.base_commit as Record<string, unknown> | null) ?? null),
		commits: toArray(raw.commits).map(
			(commit) => commit as Record<string, unknown>,
		),
		diffs: toArray(raw.diffs).map(
			(diff) => diff as Record<string, unknown>,
		),
	};
};

const normalizeArtifact = (value: unknown): z.infer<typeof artifactSchema> => {
	const raw = value as Record<string, unknown>;
	return {
		fileType: toNonEmpty(raw.file_type) ?? toNonEmpty(raw.fileType) ?? null,
		fileFormat:
			toNonEmpty(raw.file_format) ?? toNonEmpty(raw.fileFormat) ?? null,
		filename: toNonEmpty(raw.filename) ?? null,
		size: toNumber(raw.size),
	};
};

export const resolveProjectRef = (
	context: IGitLabProviderContext,
	projectId?: string | number,
	projectPath?: string,
): string => {
	if (projectId !== undefined) return encodeURIComponent(String(projectId));
	if (projectPath !== undefined && projectPath.trim() !== '') {
		return encodeURIComponent(projectPath.trim());
	}
	const fallback = context.project?.projectId ?? context.project?.projectPath;
	if (fallback !== undefined && String(fallback).trim() !== '') {
		return encodeURIComponent(String(fallback));
	}
	throw new Error(
		'a projectId or projectPath is required for this GitLab tool',
	);
};

const pageQuery = (
	page?: number,
	perPage?: number,
): Readonly<Record<string, string | number | boolean | null | undefined>> => ({
	...(page !== undefined ? { page } : {}),
	...(perPage !== undefined ? { per_page: perPage } : {}),
});

const _compactMeta = (meta: {
	readonly pagination: unknown;
	readonly rateLimit: unknown;
	readonly truncated: unknown;
	readonly requestId: string | null;
	readonly durationMs: number;
	readonly attempts: number;
	readonly status: number;
}) => ({
	status: meta.status,
	requestId: meta.requestId,
	durationMs: meta.durationMs,
	attempts: meta.attempts,
	pagination: meta.pagination,
	rateLimit: meta.rateLimit,
	truncated: meta.truncated,
});

const normalizeRequestError = (
	error: unknown,
): ReturnType<typeof toolError> => {
	if (error && typeof error === 'object' && 'message' in error) {
		const remoteError = error as GitLabRequestError;
		return toolError(
			remoteError.message,
			remoteError.code === 'unauthorized' ||
				remoteError.code === 'forbidden'
				? 'Check the GitLab token and selected project permissions.'
				: remoteError.code === 'not-found'
					? 'Check the project, ref or resource identifier.'
					: remoteError.code === 'timeout'
						? 'Retry with a smaller page or lower limits.'
						: 'Retry the request or reduce the requested scope.',
		);
	}
	return toolError(
		'GitLab request failed',
		'Retry the request or reduce the scope.',
	);
};

const requestObject = async (
	options: IGitLabToolSuiteOptions,
	path: string,
	query?: Readonly<
		Record<string, string | number | boolean | null | undefined>
	>,
): Promise<{
	readonly data: Record<string, unknown>;
	readonly meta: unknown;
}> => {
	const result = await options.client.request({
		path,
		...(query !== undefined ? { query } : {}),
		responseSchema: OBJECT_SCHEMA,
	});
	return { data: result.data as Record<string, unknown>, meta: result.meta };
};

const requestArray = async (
	options: IGitLabToolSuiteOptions,
	path: string,
	query?: Readonly<
		Record<string, string | number | boolean | null | undefined>
	>,
): Promise<{
	readonly data: readonly Record<string, unknown>[];
	readonly meta: unknown;
}> => {
	const result = await options.client.request({
		path,
		...(query !== undefined ? { query } : {}),
		responseSchema: ARRAY_SCHEMA,
	});
	return {
		data: result.data as readonly Record<string, unknown>[],
		meta: result.meta,
	};
};

const toolResponse = <T>(value: T) => toolJson(value);

const buildContextOutput = (options: IGitLabToolSuiteOptions) => ({
	provider: options.context.provider,
	host: options.context.host,
	apiBaseUrl: options.context.apiBaseUrl,
	webBaseUrl: options.context.webBaseUrl,
	defaultProject: options.context.project,
	sources: options.context.sources,
});

const ensureTempDir = async (dir: string): Promise<string> => {
	const resolved = isAbsolute(dir) ? dir : resolvePath(dir);
	await mkdir(resolved, { recursive: true });
	return resolved;
};

const safeJoin = (baseDir: string, ...segments: readonly string[]): string => {
	const resolvedBase = resolvePath(baseDir);
	const candidate = resolvePath(resolvedBase, ...segments);
	const prefix = resolvedBase.endsWith(sep)
		? resolvedBase
		: `${resolvedBase}${sep}`;
	if (candidate !== resolvedBase && !candidate.startsWith(prefix)) {
		throw new Error(
			'artifact destination must stay within the plugin temp dir',
		);
	}
	return candidate;
};

const buildPaginationOutput = (meta: unknown) => {
	const pagination = (meta as { pagination: unknown }).pagination as {
		page: number | null;
		perPage: number | null;
		nextPage: string | null;
		previousPage: string | null;
		total: number | null;
		totalPages: number | null;
		hasMore: boolean;
	} | null;
	return pagination === null
		? null
		: {
				page: pagination.page,
				perPage: pagination.perPage,
				nextPage: pagination.nextPage,
				previousPage: pagination.previousPage,
				total: pagination.total,
				totalPages: pagination.totalPages,
				hasMore: pagination.hasMore,
			};
};

export const buildMetaOutput = (meta: unknown) => {
	const raw = meta as {
		status: number;
		requestId: string | null;
		durationMs: number;
		attempts: number;
		pagination: unknown;
		rateLimit: unknown;
		truncated: unknown;
	};
	return {
		status: raw.status,
		requestId: raw.requestId,
		durationMs: raw.durationMs,
		attempts: raw.attempts,
		pagination: buildPaginationOutput(raw),
		rateLimit: raw.rateLimit,
		truncated: raw.truncated,
	};
};

export const buildGitLabContextToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	{
		id: 'context',
		summary: 'Resolved GitLab provider context.',
		tags: ['gitlab', 'orientation'],
		effects: ['network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_context`,
				{
					description:
						'Return the resolved GitLab provider context: API/web base URLs, host, token source metadata and the default project if configured. Read-only.',
					inputSchema: z.object({}).strict(),
					outputSchema: z.object({
						provider: z.literal('gitlab'),
						host: z.string(),
						apiBaseUrl: z.string().url(),
						webBaseUrl: z.string().url(),
						defaultProject: z.any().nullable(),
						sources: z.object({
							token: z.string(),
							apiBaseUrl: z.string(),
							webBaseUrl: z.string(),
							project: z.array(z.string()),
						}),
					}),
				},
				async () => toolResponse(buildContextOutput(options)),
			);
		},
	},
];

export const buildGitLabProjectsToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	{
		id: 'projects',
		summary: 'Project lookup, listing, search and variables metadata.',
		tags: ['gitlab', 'network'],
		effects: ['network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_projects`,
				{
					description:
						'List, search or fetch GitLab projects, and inspect project variable metadata without revealing variable values. Query parameters are explicit and paginated. Read-only.',
					inputSchema: z
						.object({
							action: z.enum([
								'get',
								'list',
								'search',
								'variables',
							]),
							projectId: z
								.union([z.string(), z.number()])
								.optional(),
							projectPath: z.string().optional(),
							query: z.string().min(1).max(200).optional(),
							page: z
								.number()
								.int()
								.positive()
								.max(1000)
								.optional(),
							perPage: z
								.number()
								.int()
								.positive()
								.max(100)
								.optional(),
							environmentScope: z.string().max(255).optional(),
						})
						.strict(),
					outputSchema: z.object({
						action: z.string(),
						project: projectSchema.nullable().optional(),
						projects: z.array(projectSchema).optional(),
						variables: z.array(variableSchema).optional(),
						meta: responseMetaSchema.optional(),
						nextPage: z.union([z.string(), z.null()]).optional(),
					}),
				},
				async (rawArgs: unknown) => {
					const args = rawArgs as {
						action: 'get' | 'list' | 'search' | 'variables';
						projectId?: string | number | undefined;
						projectPath?: string | undefined;
						query?: string | undefined;
						page?: number | undefined;
						perPage?: number | undefined;
						environmentScope?: string | undefined;
					};
					try {
						if (
							args.action === 'list' ||
							args.action === 'search'
						) {
							const { data, meta } = await requestArray(
								options,
								'/projects',
								{
									...(args.action === 'search' &&
									args.query !== undefined
										? { search: args.query }
										: {}),
									...pageQuery(args.page, args.perPage),
									order_by: 'last_activity_at',
									sort: 'desc',
								},
							);
							return toolResponse({
								action: args.action,
								projects: data.map(normalizeProject),
								meta: buildMetaOutput(meta),
								nextPage:
									(
										meta as {
											pagination: {
												nextPage: string | null;
											} | null;
										}
									).pagination?.nextPage ?? null,
							});
						}
						if (args.action === 'variables') {
							const project = resolveProjectRef(
								options.context,
								args.projectId,
								args.projectPath,
							);
							const { data, meta } = await requestArray(
								options,
								`/projects/${project}/variables`,
								{
									...(args.environmentScope !== undefined
										? { filter: args.environmentScope }
										: {}),
									...pageQuery(args.page, args.perPage),
								},
							);
							return toolResponse({
								action: args.action,
								variables: data.map(normalizeVariable),
								meta: buildMetaOutput(meta),
								nextPage:
									(
										meta as {
											pagination: {
												nextPage: string | null;
											} | null;
										}
									).pagination?.nextPage ?? null,
							});
						}
						const project = resolveProjectRef(
							options.context,
							args.projectId,
							args.projectPath,
						);
						const { data, meta } = await requestObject(
							options,
							`/projects/${project}`,
						);
						return toolResponse({
							action: args.action,
							project: normalizeProject(data),
							meta: buildMetaOutput(meta),
						});
					} catch (error) {
						return error instanceof Error
							? normalizeRequestError(error)
							: toolError('GitLab project lookup failed');
					}
				},
			);
		},
	},
];

const buildIssueLikeRegistration = (
	options: IGitLabToolSuiteOptions,
	kind: 'issues' | 'merge_requests',
): IToolRegistration => ({
	id: kind,
	summary:
		kind === 'issues'
			? 'Issues listing, search and discussions.'
			: 'Merge requests listing, search and discussions.',
	tags: ['gitlab', 'network'],
	effects: ['network'],
	register: async (server) => {
		const toolName = `${options.namespacePrefix}_${kind}`;
		server.registerTool(
			toolName,
			{
				description:
					kind === 'issues'
						? 'List, search or inspect GitLab issues, and fetch flat comments or grouped discussions. The output is compact and paginated.'
						: 'List, search or inspect GitLab merge requests, and fetch flat comments or grouped discussions. The output is compact and paginated.',
				inputSchema: z
					.object({
						action: z.enum([
							'get',
							'list',
							'search',
							'comments',
							'discussions',
						]),
						projectId: z.union([z.string(), z.number()]).optional(),
						projectPath: z.string().optional(),
						iid: z.union([z.string(), z.number()]).optional(),
						query: z.string().min(1).max(200).optional(),
						state: z.enum(['opened', 'closed', 'all']).optional(),
						page: z.number().int().positive().max(1000).optional(),
						perPage: z
							.number()
							.int()
							.positive()
							.max(100)
							.optional(),
					})
					.strict(),
				outputSchema: z.object({
					action: z.string(),
					issue: issueSchema.nullable().optional(),
					issues: z.array(issueSchema).optional(),
					mergeRequest: mergeRequestSchema.nullable().optional(),
					mergeRequests: z.array(mergeRequestSchema).optional(),
					comments: z.array(noteSchema).optional(),
					discussions: z.array(discussionSchema).optional(),
					meta: responseMetaSchema.optional(),
					nextPage: z.union([z.string(), z.null()]).optional(),
				}),
			},
			async (rawArgs: unknown) => {
				const args = rawArgs as {
					action:
						| 'get'
						| 'list'
						| 'search'
						| 'comments'
						| 'discussions';
					projectId?: string | number | undefined;
					projectPath?: string | undefined;
					iid?: string | number | undefined;
					query?: string | undefined;
					state?: 'opened' | 'closed' | 'all' | undefined;
					page?: number | undefined;
					perPage?: number | undefined;
				};
				try {
					const project = resolveProjectRef(
						options.context,
						args.projectId,
						args.projectPath,
					);
					const collection =
						kind === 'issues' ? 'issues' : 'merge_requests';
					if (args.action === 'list' || args.action === 'search') {
						const { data, meta } = await requestArray(
							options,
							`/projects/${project}/${collection}`,
							{
								...(args.state !== undefined
									? { state: args.state }
									: {}),
								...(args.action === 'search' &&
								args.query !== undefined
									? {
											search: args.query,
											in: 'title,description',
										}
									: {}),
								...pageQuery(args.page, args.perPage),
							},
						);
						return toolResponse({
							action: args.action,
							...(kind === 'issues'
								? {
										issues: data.map((item) =>
											normalizeIssue(item),
										),
									}
								: {
										mergeRequests: data.map((item) =>
											normalizeMergeRequest(item),
										),
									}),
							meta: buildMetaOutput(meta),
							nextPage:
								(
									meta as {
										pagination: {
											nextPage: string | null;
										} | null;
									}
								).pagination?.nextPage ?? null,
						});
					}
					if (
						args.action === 'comments' ||
						args.action === 'discussions'
					) {
						if (args.iid === undefined) {
							throw new Error(
								'iid is required for comments/discussions',
							);
						}
						const item = String(args.iid);
						const suffix =
							args.action === 'comments'
								? 'notes'
								: 'discussions';
						const { data, meta } = await requestArray(
							options,
							`/projects/${project}/${collection}/${item}/${suffix}`,
							pageQuery(args.page, args.perPage),
						);
						return toolResponse({
							action: args.action,
							...(args.action === 'comments'
								? {
										comments: data.map((item) =>
											normalizeNote(item),
										),
									}
								: {
										discussions: data.map((item) =>
											normalizeDiscussion(item),
										),
									}),
							meta: buildMetaOutput(meta),
							nextPage:
								(
									meta as {
										pagination: {
											nextPage: string | null;
										} | null;
									}
								).pagination?.nextPage ?? null,
						});
					}
					if (args.iid === undefined) {
						throw new Error('iid is required for get');
					}
					const { data, meta } = await requestObject(
						options,
						`/projects/${project}/${collection}/${String(args.iid)}`,
					);
					return toolResponse({
						action: args.action,
						...(kind === 'issues'
							? { issue: normalizeIssue(data) }
							: { mergeRequest: normalizeMergeRequest(data) }),
						meta: buildMetaOutput(meta),
					});
				} catch (error) {
					return error instanceof Error
						? normalizeRequestError(error)
						: toolError('GitLab resource lookup failed');
				}
			},
		);
	},
});

export const buildGitLabIssuesToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	buildIssueLikeRegistration(options, 'issues'),
];

export const buildGitLabMergeRequestsToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	buildIssueLikeRegistration(options, 'merge_requests'),
];

export const buildGitLabCommitsToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	{
		id: 'commits',
		summary: 'Commit history and commit details.',
		tags: ['gitlab', 'network'],
		effects: ['network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_commits`,
				{
					description:
						'List commits, search commits or inspect one commit with stats. The output is compact and paginated. Read-only.',
					inputSchema: z
						.object({
							action: z.enum(['get', 'list', 'search']),
							projectId: z
								.union([z.string(), z.number()])
								.optional(),
							projectPath: z.string().optional(),
							sha: z.string().optional(),
							refName: z.string().optional(),
							query: z.string().min(1).max(200).optional(),
							page: z
								.number()
								.int()
								.positive()
								.max(1000)
								.optional(),
							perPage: z
								.number()
								.int()
								.positive()
								.max(100)
								.optional(),
						})
						.strict(),
					outputSchema: z.object({
						action: z.string(),
						commit: commitSchema.nullable().optional(),
						commits: z.array(commitSchema).optional(),
						meta: responseMetaSchema.optional(),
						nextPage: z.union([z.string(), z.null()]).optional(),
					}),
				},
				async (rawArgs: unknown) => {
					const args = rawArgs as {
						action: 'get' | 'list' | 'search';
						projectId?: string | number | undefined;
						projectPath?: string | undefined;
						sha?: string | undefined;
						refName?: string | undefined;
						query?: string | undefined;
						page?: number | undefined;
						perPage?: number | undefined;
					};
					try {
						const project = resolveProjectRef(
							options.context,
							args.projectId,
							args.projectPath,
						);
						if (args.action === 'get') {
							if (args.sha === undefined)
								throw new Error('sha is required for get');
							const { data, meta } = await requestObject(
								options,
								`/projects/${project}/repository/commits/${encodeURIComponent(args.sha)}`,
								{ with_stats: true },
							);
							return toolResponse({
								action: args.action,
								commit: normalizeCommit(data),
								meta: buildMetaOutput(meta),
							});
						}
						const { data, meta } = await requestArray(
							options,
							`/projects/${project}/repository/commits`,
							{
								...(args.refName !== undefined
									? { ref_name: args.refName }
									: {}),
								...(args.action === 'search' &&
								args.query !== undefined
									? { search: args.query }
									: {}),
								...pageQuery(args.page, args.perPage),
							},
						);
						return toolResponse({
							action: args.action,
							commits: data.map(normalizeCommit),
							meta: buildMetaOutput(meta),
							nextPage:
								(
									meta as {
										pagination: {
											nextPage: string | null;
										} | null;
									}
								).pagination?.nextPage ?? null,
						});
					} catch (error) {
						return error instanceof Error
							? normalizeRequestError(error)
							: toolError('GitLab commit lookup failed');
					}
				},
			);
		},
	},
];

export const buildGitLabRefsToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	{
		id: 'refs',
		summary: 'Compare refs and list repository branches/tags.',
		tags: ['gitlab', 'network'],
		effects: ['network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_refs`,
				{
					description:
						'Compare two refs and return compact commit/diff metadata. Read-only.',
					inputSchema: z
						.object({
							projectId: z
								.union([z.string(), z.number()])
								.optional(),
							projectPath: z.string().optional(),
							from: NON_EMPTY,
							to: NON_EMPTY,
						})
						.strict(),
					outputSchema: z.object({
						compare: compareSchema,
						meta: responseMetaSchema.optional(),
					}),
				},
				async (rawArgs: unknown) => {
					const args = rawArgs as {
						projectId?: string | number | undefined;
						projectPath?: string | undefined;
						from: string;
						to: string;
					};
					try {
						const project = resolveProjectRef(
							options.context,
							args.projectId,
							args.projectPath,
						);
						const { data, meta } = await requestObject(
							options,
							`/projects/${project}/repository/compare`,
							{ from: args.from, to: args.to },
						);
						return toolResponse({
							compare: normalizeCompare(data),
							meta: buildMetaOutput(meta),
						});
					} catch (error) {
						return error instanceof Error
							? normalizeRequestError(error)
							: toolError('GitLab compare failed');
					}
				},
			);
		},
	},
];

export const buildGitLabPipelinesToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	{
		id: 'pipelines',
		summary: 'Pipeline listing and pipeline details.',
		tags: ['gitlab', 'network'],
		effects: ['network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_pipelines`,
				{
					description:
						'List or inspect GitLab pipelines with explicit pagination and compact metadata. Read-only.',
					inputSchema: z
						.object({
							action: z.enum(['get', 'list']),
							projectId: z
								.union([z.string(), z.number()])
								.optional(),
							projectPath: z.string().optional(),
							id: z.union([z.string(), z.number()]).optional(),
							ref: z.string().optional(),
							status: z.string().optional(),
							page: z
								.number()
								.int()
								.positive()
								.max(1000)
								.optional(),
							perPage: z
								.number()
								.int()
								.positive()
								.max(100)
								.optional(),
						})
						.strict(),
					outputSchema: z.object({
						action: z.string(),
						pipeline: pipelineSchema.nullable().optional(),
						pipelines: z.array(pipelineSchema).optional(),
						meta: responseMetaSchema.optional(),
						nextPage: z.union([z.string(), z.null()]).optional(),
					}),
				},
				async (rawArgs: unknown) => {
					const args = rawArgs as {
						action: 'get' | 'list';
						projectId?: string | number | undefined;
						projectPath?: string | undefined;
						id?: string | number | undefined;
						ref?: string | undefined;
						status?: string | undefined;
						page?: number | undefined;
						perPage?: number | undefined;
					};
					try {
						const project = resolveProjectRef(
							options.context,
							args.projectId,
							args.projectPath,
						);
						if (args.action === 'get') {
							if (args.id === undefined)
								throw new Error('id is required for get');
							const { data, meta } = await requestObject(
								options,
								`/projects/${project}/pipelines/${String(args.id)}`,
							);
							return toolResponse({
								action: args.action,
								pipeline: normalizePipeline(data),
								meta: buildMetaOutput(meta),
							});
						}
						const { data, meta } = await requestArray(
							options,
							`/projects/${project}/pipelines`,
							{
								...(args.ref !== undefined
									? { ref: args.ref }
									: {}),
								...(args.status !== undefined
									? { status: args.status }
									: {}),
								...pageQuery(args.page, args.perPage),
							},
						);
						return toolResponse({
							action: args.action,
							pipelines: data.map(normalizePipeline),
							meta: buildMetaOutput(meta),
							nextPage:
								(
									meta as {
										pagination: {
											nextPage: string | null;
										} | null;
									}
								).pagination?.nextPage ?? null,
						});
					} catch (error) {
						return error instanceof Error
							? normalizeRequestError(error)
							: toolError('GitLab pipeline lookup failed');
					}
				},
			);
		},
	},
];

export const buildGitLabJobsToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	{
		id: 'jobs',
		summary: 'Job listing, job details and limited job logs.',
		tags: ['gitlab', 'network'],
		effects: ['network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_jobs`,
				{
					description:
						'List or inspect GitLab jobs, or fetch a limited log with explicit byte/line caps. Read-only.',
					inputSchema: z
						.object({
							action: z.enum(['get', 'list', 'log']),
							projectId: z
								.union([z.string(), z.number()])
								.optional(),
							projectPath: z.string().optional(),
							id: z.union([z.string(), z.number()]).optional(),
							pipelineId: z
								.union([z.string(), z.number()])
								.optional(),
							status: z.string().optional(),
							page: z
								.number()
								.int()
								.positive()
								.max(1000)
								.optional(),
							perPage: z
								.number()
								.int()
								.positive()
								.max(100)
								.optional(),
							maxBytes: z
								.number()
								.int()
								.positive()
								.max(1024 * 1024)
								.optional(),
							maxLines: z
								.number()
								.int()
								.positive()
								.max(5000)
								.optional(),
							maxDurationMs: z
								.number()
								.int()
								.positive()
								.max(120000)
								.optional(),
						})
						.strict(),
					outputSchema: z.object({
						action: z.string(),
						job: jobSchema.nullable().optional(),
						jobs: z.array(jobSchema).optional(),
						log: z
							.object({
								text: z.string(),
								truncated: z.boolean(),
								bytes: z.number().int(),
								lines: z.number().int(),
								reason: z.string().nullable(),
							})
							.nullable()
							.optional(),
						meta: responseMetaSchema.optional(),
						nextPage: z.union([z.string(), z.null()]).optional(),
					}),
				},
				async (rawArgs: unknown) => {
					const args = rawArgs as {
						action: 'get' | 'list' | 'log';
						projectId?: string | number | undefined;
						projectPath?: string | undefined;
						id?: string | number | undefined;
						pipelineId?: string | number | undefined;
						status?: string | undefined;
						page?: number | undefined;
						perPage?: number | undefined;
						maxBytes?: number | undefined;
						maxLines?: number | undefined;
						maxDurationMs?: number | undefined;
					};
					try {
						const project = resolveProjectRef(
							options.context,
							args.projectId,
							args.projectPath,
						);
						if (args.action === 'get') {
							if (args.id === undefined)
								throw new Error('id is required for get');
							const { data, meta } = await requestObject(
								options,
								`/projects/${project}/jobs/${String(args.id)}`,
							);
							return toolResponse({
								action: args.action,
								job: normalizeJob(data),
								meta: buildMetaOutput(meta),
							});
						}
						if (args.action === 'log') {
							if (args.id === undefined)
								throw new Error('id is required for log');
							const startedAt = Date.now();
							const result = await options.client.request<string>(
								{
									path: `/projects/${project}/jobs/${String(args.id)}/trace`,
									parseAs: 'text',
								},
							);
							const maxBytes = args.maxBytes ?? 64 * 1024;
							const maxLines = args.maxLines ?? 800;
							const raw = result.data;
							const bytes = Buffer.byteLength(raw, 'utf8');
							const lines = raw.split('\n');
							const durationMs = Date.now() - startedAt;
							const truncatedByTime =
								args.maxDurationMs !== undefined &&
								durationMs > args.maxDurationMs;
							const truncatedByBytes = bytes > maxBytes;
							const truncatedByLines = lines.length > maxLines;
							const keep = lines.slice(0, maxLines).join('\n');
							const text = truncateUtf8Bytes(keep, maxBytes);
							return toolResponse({
								action: args.action,
								log: {
									text,
									truncated:
										truncatedByTime ||
										truncatedByBytes ||
										truncatedByLines,
									bytes,
									lines: lines.length,
									reason: truncatedByTime
										? 'time-limit'
										: truncatedByBytes
											? 'byte-limit'
											: truncatedByLines
												? 'line-limit'
												: null,
								},
								meta: buildMetaOutput(result.meta),
							});
						}
						const jobsPath =
							args.pipelineId !== undefined
								? `/projects/${project}/pipelines/${String(args.pipelineId)}/jobs`
								: `/projects/${project}/jobs`;
						const { data, meta } = await requestArray(
							options,
							jobsPath,
							{
								...(args.status !== undefined
									? { status: args.status }
									: {}),
								...pageQuery(args.page, args.perPage),
							},
						);
						return toolResponse({
							action: args.action,
							jobs: data.map(normalizeJob),
							meta: buildMetaOutput(meta),
							nextPage:
								(
									meta as {
										pagination: {
											nextPage: string | null;
										} | null;
									}
								).pagination?.nextPage ?? null,
						});
					} catch (error) {
						return error instanceof Error
							? normalizeRequestError(error)
							: toolError('GitLab job lookup failed');
					}
				},
			);
		},
	},
];

export const buildGitLabArtifactsToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	{
		id: 'artifacts',
		summary: 'Artifact metadata and limited downloads to a temp dir.',
		tags: ['gitlab', 'network'],
		effects: ['network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_artifacts`,
				{
					description:
						'List job artifact metadata or download an artifact archive into the plugin temp dir. Paths are constrained to the plugin temp dir and the payload is size-limited. Read-only.',
					inputSchema: z
						.object({
							action: z.enum(['list', 'download']),
							projectId: z
								.union([z.string(), z.number()])
								.optional(),
							projectPath: z.string().optional(),
							jobId: z.union([z.string(), z.number()]).optional(),
							filename: z.string().optional(),
							maxBytes: z
								.number()
								.int()
								.positive()
								.max(16 * 1024 * 1024)
								.optional(),
						})
						.strict(),
					outputSchema: z.object({
						action: z.string(),
						artifacts: z.array(artifactSchema).optional(),
						savedTo: z.string().optional(),
						bytes: z.number().int().optional(),
						truncated: z.boolean().optional(),
						meta: responseMetaSchema.optional(),
					}),
				},
				async (rawArgs: unknown) => {
					const args = rawArgs as {
						action: 'list' | 'download';
						projectId?: string | number | undefined;
						projectPath?: string | undefined;
						jobId?: string | number | undefined;
						filename?: string | undefined;
						maxBytes?: number | undefined;
					};
					try {
						const project = resolveProjectRef(
							options.context,
							args.projectId,
							args.projectPath,
						);
						if (args.action === 'list') {
							if (args.jobId === undefined)
								throw new Error('jobId is required for list');
							const { data, meta } = await requestObject(
								options,
								`/projects/${project}/jobs/${String(args.jobId)}`,
							);
							return toolResponse({
								action: args.action,
								artifacts: toArray(data.artifacts).map(
									normalizeArtifact,
								),
								meta: buildMetaOutput(meta),
							});
						}
						if (args.jobId === undefined)
							throw new Error('jobId is required for download');
						const maxBytes = args.maxBytes ?? 4 * 1024 * 1024;
						const result =
							await options.client.request<ArrayBuffer>({
								path: `/projects/${project}/jobs/${String(args.jobId)}/artifacts`,
								parseAs: 'binary',
							});
						const binary = result.data;
						const bytes = binary.byteLength;
						const tempDir = await ensureTempDir(
							join(options.pluginTempDir, 'artifacts'),
						);
						const fileName = sanitizeArtifactFileName(
							args.filename ?? `job-${String(args.jobId)}.zip`,
						);
						const target = safeJoin(
							tempDir,
							String(project),
							String(args.jobId),
							fileName,
						);
						await mkdir(resolvePath(target, '..'), {
							recursive: true,
						});
						const truncated = bytes > maxBytes;
						await writeFileAtomic(
							target,
							Buffer.from(binary.slice(0, maxBytes)),
						);
						return toolResponse({
							action: args.action,
							savedTo: target,
							bytes,
							truncated,
							meta: buildMetaOutput(result.meta),
						});
					} catch (error) {
						return error instanceof Error
							? normalizeRequestError(error)
							: toolError('GitLab artifacts lookup failed');
					}
				},
			);
		},
	},
];

export const buildGitLabReleasesToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	{
		id: 'releases',
		summary: 'Releases and tags.',
		tags: ['gitlab', 'network'],
		effects: ['network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_releases`,
				{
					description:
						'List or inspect GitLab releases, or list repository tags with compact metadata. Read-only.',
					inputSchema: z
						.object({
							action: z.enum(['list', 'get', 'tags']),
							projectId: z
								.union([z.string(), z.number()])
								.optional(),
							projectPath: z.string().optional(),
							tagName: z.string().optional(),
							page: z
								.number()
								.int()
								.positive()
								.max(1000)
								.optional(),
							perPage: z
								.number()
								.int()
								.positive()
								.max(100)
								.optional(),
						})
						.strict(),
					outputSchema: z.object({
						action: z.string(),
						release: releaseSchema.nullable().optional(),
						releases: z.array(releaseSchema).optional(),
						tags: z.array(tagSchema).optional(),
						meta: responseMetaSchema.optional(),
						nextPage: z.union([z.string(), z.null()]).optional(),
					}),
				},
				async (rawArgs: unknown) => {
					const args = rawArgs as {
						action: 'list' | 'get' | 'tags';
						projectId?: string | number | undefined;
						projectPath?: string | undefined;
						tagName?: string | undefined;
						page?: number | undefined;
						perPage?: number | undefined;
					};
					try {
						const project = resolveProjectRef(
							options.context,
							args.projectId,
							args.projectPath,
						);
						if (args.action === 'get') {
							if (args.tagName === undefined)
								throw new Error('tagName is required for get');
							const { data, meta } = await requestObject(
								options,
								`/projects/${project}/releases/${encodeURIComponent(args.tagName)}`,
							);
							return toolResponse({
								action: args.action,
								release: normalizeRelease(data),
								meta: buildMetaOutput(meta),
							});
						}
						if (args.action === 'tags') {
							const { data, meta } = await requestArray(
								options,
								`/projects/${project}/repository/tags`,
								{ ...pageQuery(args.page, args.perPage) },
							);
							return toolResponse({
								action: args.action,
								tags: data.map(normalizeTag),
								meta: buildMetaOutput(meta),
								nextPage:
									(
										meta as {
											pagination: {
												nextPage: string | null;
											} | null;
										}
									).pagination?.nextPage ?? null,
							});
						}
						const { data, meta } = await requestArray(
							options,
							`/projects/${project}/releases`,
							{ ...pageQuery(args.page, args.perPage) },
						);
						return toolResponse({
							action: args.action,
							releases: data.map(normalizeRelease),
							meta: buildMetaOutput(meta),
							nextPage:
								(
									meta as {
										pagination: {
											nextPage: string | null;
										} | null;
									}
								).pagination?.nextPage ?? null,
						});
					} catch (error) {
						return error instanceof Error
							? normalizeRequestError(error)
							: toolError('GitLab release lookup failed');
					}
				},
			);
		},
	},
];

export const buildGitLabDeploymentsToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	{
		id: 'deployments',
		summary: 'Deployment listing and deployment details.',
		tags: ['gitlab', 'network'],
		effects: ['network'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_deployments`,
				{
					description:
						'List or inspect GitLab deployments with compact environment metadata. Read-only.',
					inputSchema: z
						.object({
							action: z.enum(['get', 'list']),
							projectId: z
								.union([z.string(), z.number()])
								.optional(),
							projectPath: z.string().optional(),
							id: z.union([z.string(), z.number()]).optional(),
							environment: z.string().optional(),
							page: z
								.number()
								.int()
								.positive()
								.max(1000)
								.optional(),
							perPage: z
								.number()
								.int()
								.positive()
								.max(100)
								.optional(),
						})
						.strict(),
					outputSchema: z.object({
						action: z.string(),
						deployment: deploymentSchema.nullable().optional(),
						deployments: z.array(deploymentSchema).optional(),
						meta: responseMetaSchema.optional(),
						nextPage: z.union([z.string(), z.null()]).optional(),
					}),
				},
				async (rawArgs: unknown) => {
					const args = rawArgs as {
						action: 'get' | 'list';
						projectId?: string | number | undefined;
						projectPath?: string | undefined;
						id?: string | number | undefined;
						environment?: string | undefined;
						page?: number | undefined;
						perPage?: number | undefined;
					};
					try {
						const project = resolveProjectRef(
							options.context,
							args.projectId,
							args.projectPath,
						);
						if (args.action === 'get') {
							if (args.id === undefined)
								throw new Error('id is required for get');
							const { data, meta } = await requestObject(
								options,
								`/projects/${project}/deployments/${String(args.id)}`,
							);
							return toolResponse({
								action: args.action,
								deployment: normalizeDeployment(data),
								meta: buildMetaOutput(meta),
							});
						}
						const { data, meta } = await requestArray(
							options,
							`/projects/${project}/deployments`,
							{
								...(args.environment !== undefined
									? { environment: args.environment }
									: {}),
								...pageQuery(args.page, args.perPage),
							},
						);
						return toolResponse({
							action: args.action,
							deployments: data.map(normalizeDeployment),
							meta: buildMetaOutput(meta),
							nextPage:
								(
									meta as {
										pagination: {
											nextPage: string | null;
										} | null;
									}
								).pagination?.nextPage ?? null,
						});
					} catch (error) {
						return error instanceof Error
							? normalizeRequestError(error)
							: toolError('GitLab deployment lookup failed');
					}
				},
			);
		},
	},
];

export const buildGitLabToolRegistrations = (
	options: IGitLabToolSuiteOptions,
): readonly IToolRegistration[] => [
	...buildGitLabContextToolRegistrations(options),
	...buildGitLabProjectsToolRegistrations(options),
	...buildGitLabIssuesToolRegistrations(options),
	...buildGitLabMergeRequestsToolRegistrations(options),
	...buildGitLabCommitsToolRegistrations(options),
	...buildGitLabRefsToolRegistrations(options),
	...buildGitLabPipelinesToolRegistrations(options),
	...buildGitLabJobsToolRegistrations(options),
	...buildGitLabArtifactsToolRegistrations(options),
	...buildGitLabReleasesToolRegistrations(options),
	...buildGitLabDeploymentsToolRegistrations(options),
];
