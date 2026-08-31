import z from 'zod';

import type {
	IRemoteMutationAuditReceipt,
	IRemoteMutationError,
	RemoteMutationMethod,
	RemoteMutationResult,
} from '@mcp-vertex/contracts/remote-mutations';
import type { IRemoteProviderError } from '@mcp-vertex/contracts/remote-provider';
import {
	createRemoteMutationExecutor,
	type IRemoteHttpClientDeps,
} from '../../../remote-provider-core/src/index';

import type { IGitHubProviderContext } from './config';

const GITHUB_API_VERSION = '2022-11-28';
const MAX_AUDIT_VALUE_LENGTH = 200;

const JsonRecordSchema = z.record(z.string(), z.unknown());
const IssueResponseSchema = JsonRecordSchema;
const CommentResponseSchema = JsonRecordSchema;
const ReleaseResponseSchema = JsonRecordSchema;
const RefResponseSchema = JsonRecordSchema;
const EmptyTextSchema = z.string();

const asRecord = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: {};
const asArray = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];
const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;
const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const asBool = (value: unknown): boolean | undefined =>
	typeof value === 'boolean' ? value : undefined;

const trimAuditValue = (value: string): string =>
	value.length <= MAX_AUDIT_VALUE_LENGTH
		? value
		: `${value.slice(0, MAX_AUDIT_VALUE_LENGTH)}...`;

const sanitizeAuditDetails = (
	details:
		| Readonly<Record<string, string | number | boolean | null | undefined>>
		| undefined,
): Readonly<Record<string, string | number | boolean | null>> | undefined => {
	if (details === undefined) return undefined;
	const result: Record<string, string | number | boolean | null> = {};
	for (const [key, value] of Object.entries(details)) {
		if (value === undefined) continue;
		result[key] = typeof value === 'string' ? trimAuditValue(value) : value;
	}
	return Object.keys(result).length > 0 ? result : undefined;
};

const stableJson = (value: unknown): string => {
	const sortValue = (input: unknown): unknown => {
		if (Array.isArray(input)) return input.map(sortValue);
		if (input !== null && typeof input === 'object') {
			return Object.fromEntries(
				Object.entries(input as Record<string, unknown>)
					.sort(([left], [right]) => left.localeCompare(right))
					.map(([key, nested]) => [key, sortValue(nested)]),
			);
		}
		return input;
	};
	return JSON.stringify(sortValue(value));
};

const bodySampleOf = (error: IRemoteMutationError | undefined): string => {
	const sample = error?.details?.bodySample;
	return typeof sample === 'string' ? sample : '';
};

const messageLooksDuplicate = (value: string): boolean =>
	/(already exists|already_exists|reference already exists|tag already exists|release already exists)/i.test(
		value,
	);

const mapUser = (value: unknown): string =>
	asString(asRecord(value).login) ?? 'unknown';
const mapLabels = (value: unknown): string[] =>
	asArray(value)
		.map((item) => asString(asRecord(item).name) ?? '')
		.filter((label): label is string => label.length > 0);
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
const mapComment = (value: unknown) => {
	const comment = asRecord(value);
	return {
		author: mapUser(comment.user),
		body: asString(comment.body) ?? '',
		createdAt: asString(comment.created_at),
		url: asString(comment.html_url),
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
const mapCreatedTag = (value: unknown) => {
	const item = asRecord(value);
	const ref = asString(item.ref) ?? '';
	const object = asRecord(item.object);
	return {
		name: ref.startsWith('refs/tags/')
			? ref.slice('refs/tags/'.length)
			: ref,
		sha: asString(object.sha) ?? '',
		url: asString(object.url),
	};
};

const mapMutationResult = <TRaw, TExistingRaw, TData, TExistingData = TData>(
	result: RemoteMutationResult<TRaw, TExistingRaw>,
	mapApplied: (value: TRaw) => TData,
	mapExisting: (value: TExistingRaw) => TExistingData,
): RemoteMutationResult<TData, TExistingData> => {
	if (!result.ok) return result as RemoteMutationResult<TData, TExistingData>;
	if (result.outcome === 'applied') {
		return {
			...result,
			data: mapApplied(result.data),
		};
	}
	if (result.duplicate.existing === undefined) {
		return result as RemoteMutationResult<TData, TExistingData>;
	}
	return {
		...result,
		duplicate: {
			...result.duplicate,
			existing: mapExisting(result.duplicate.existing as TExistingRaw),
		},
	};
};

type RepoSelector = {
	readonly owner?: string;
	readonly repository?: string;
};

interface IMutationCommon {
	readonly confirm?: boolean;
	readonly actor?: string;
	readonly idempotencyKey?: string;
}

export interface IGitHubIssueUpdateArgs extends RepoSelector, IMutationCommon {
	readonly issue: string | number;
	readonly title?: string;
	readonly body?: string;
	readonly state?: 'open' | 'closed';
	readonly labels?: readonly string[];
}

export interface IGitHubIssueCommentCreateArgs
	extends RepoSelector,
		IMutationCommon {
	readonly issue: string | number;
	readonly body: string;
}

export interface IGitHubWorkflowDispatchArgs
	extends RepoSelector,
		IMutationCommon {
	readonly workflowId: string | number;
	readonly ref: string;
	readonly inputs?: Readonly<Record<string, string>>;
}

export interface IGitHubRepositoryDispatchArgs
	extends RepoSelector,
		IMutationCommon {
	readonly eventType: string;
	readonly clientPayload?: Readonly<Record<string, unknown>>;
}

export interface IGitHubReleaseCreateArgs
	extends RepoSelector,
		IMutationCommon {
	readonly tagName: string;
	readonly targetCommitish?: string;
	readonly name?: string;
	readonly body?: string;
	readonly draft?: boolean;
	readonly prerelease?: boolean;
	readonly generateReleaseNotes?: boolean;
}

export interface IGitHubReleaseUpdateArgs
	extends RepoSelector,
		IMutationCommon {
	readonly releaseId: string | number;
	readonly tagName?: string;
	readonly targetCommitish?: string;
	readonly name?: string;
	readonly body?: string;
	readonly draft?: boolean;
	readonly prerelease?: boolean;
	readonly generateReleaseNotes?: boolean;
}

export interface IGitHubReleaseDeleteArgs
	extends RepoSelector,
		IMutationCommon {
	readonly releaseId: string | number;
}

export interface IGitHubTagCreateArgs extends RepoSelector, IMutationCommon {
	readonly tagName: string;
	readonly sha: string;
}

export interface IGitHubTagDeleteArgs extends RepoSelector, IMutationCommon {
	readonly tagName: string;
}

export interface IGitHubMutationsOptions {
	readonly context: IGitHubProviderContext;
	readonly mutationDeps: IRemoteHttpClientDeps;
	readonly nowIso?: () => string;
}

const actorOf = (actor: string | undefined): string =>
	actor?.trim() || 'copilot';

const createAuditReceipt = (
	provider: 'github',
	request: {
		readonly actor: string;
		readonly effect: string;
		readonly resource: string;
		readonly method: RemoteMutationMethod;
		readonly path: string;
		readonly idempotencyKey: string | undefined;
	},
	timestamp: string,
	remote: IRemoteMutationAuditReceipt['remote'],
	details:
		| Readonly<Record<string, string | number | boolean | null>>
		| undefined,
): IRemoteMutationAuditReceipt => ({
	provider,
	actor: request.actor,
	effect: request.effect,
	resource: request.resource,
	timestamp,
	request: { method: request.method, path: request.path },
	remote,
	idempotency: {
		key: request.idempotencyKey?.trim() || null,
		replay: false,
	},
	...(details === undefined ? {} : { details }),
});

const preflightFailure = <TData, TExisting = TData>(input: {
	nowIso: () => string;
	request: {
		readonly actor: string;
		readonly effect: string;
		readonly resource: string;
		readonly method: RemoteMutationMethod;
		readonly path: string;
		readonly idempotencyKey: string | undefined;
	};
	error: IRemoteProviderError;
	details:
		| Readonly<Record<string, string | number | boolean | null>>
		| undefined;
}): RemoteMutationResult<TData, TExisting> => ({
	ok: false,
	outcome: 'failed',
	provider: 'github',
	error: {
		...input.error,
		code: input.error.code,
	} as IRemoteMutationError,
	audit: createAuditReceipt(
		'github',
		input.request,
		input.nowIso(),
		{ status: null, requestId: null, attempts: 0, duplicate: false },
		input.details,
	),
	idempotentReplay: false,
});

const resolveRepo = <TData, TExisting = TData>(
	context: IGitHubProviderContext,
	args: RepoSelector,
	preflight: {
		nowIso: () => string;
		request: {
			readonly actor: string;
			readonly effect: string;
			readonly resource: string;
			readonly method: RemoteMutationMethod;
			readonly path: string;
			readonly idempotencyKey: string | undefined;
		};
		readonly details:
			| Readonly<Record<string, string | number | boolean | null>>
			| undefined;
	},
):
	| { readonly owner: string; readonly repository: string }
	| RemoteMutationResult<TData, TExisting> => {
	const owner = args.owner ?? context.repository?.owner;
	const repository = args.repository ?? context.repository?.repository;
	if (owner !== undefined && repository !== undefined)
		return { owner, repository };
	return preflightFailure<TData, TExisting>({
		nowIso: preflight.nowIso,
		request: preflight.request,
		details: preflight.details,
		error: {
			code: 'invalid-config',
			provider: 'github',
			message: 'github mutation requires owner and repository',
			status: null,
			requestId: null,
			retryAfterSeconds: null,
			temporary: false,
			retryable: false,
		},
	});
};

const releaseDuplicateClassifier = ({
	error,
}: {
	error?: IRemoteMutationError;
}) => {
	if (error === undefined) return null;
	const sample = `${error.message} ${bodySampleOf(error)}`;
	return error.status !== null &&
		(error.status === 409 || error.status === 422) &&
		messageLooksDuplicate(sample)
		? { message: 'release already exists remotely' }
		: null;
};

const tagDuplicateClassifier = ({
	error,
}: {
	error?: IRemoteMutationError;
}) => {
	if (error === undefined) return null;
	const sample = `${error.message} ${bodySampleOf(error)}`;
	return error.status === 422 && messageLooksDuplicate(sample)
		? { message: 'tag already exists remotely' }
		: null;
};

const maybeConfirm = (confirm: boolean | undefined) =>
	confirm === undefined ? {} : { confirm };

const maybeIdempotencyKey = (idempotencyKey: string | undefined) =>
	idempotencyKey === undefined ? {} : { idempotencyKey };

const maybeAuditDetails = (
	auditDetails:
		| Readonly<Record<string, string | number | boolean | null>>
		| undefined,
) => (auditDetails === undefined ? {} : { auditDetails });

export const createGitHubMutations = (options: IGitHubMutationsOptions) => {
	const nowIso = options.nowIso ?? (() => new Date().toISOString());
	const executor = createRemoteMutationExecutor(
		{
			provider: 'github',
			baseUrl: options.context.apiBaseUrl,
			token: options.context.token,
			timeoutMs: options.context.timeoutMs,
			defaultHeaders: {
				accept: 'application/json',
				'content-type': 'application/json',
				'x-github-api-version': GITHUB_API_VERSION,
			},
			nowIso,
		},
		options.mutationDeps,
	);

	return {
		async updateIssue(args: IGitHubIssueUpdateArgs) {
			const actor = actorOf(args.actor);
			const resource = `${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}#issue-${String(args.issue)}`;
			const preflightDetails = sanitizeAuditDetails({
				fieldsChanged: [
					args.title !== undefined ? 'title' : null,
					args.body !== undefined ? 'body' : null,
					args.state !== undefined ? 'state' : null,
					args.labels !== undefined ? 'labels' : null,
				]
					.filter((value): value is string => value !== null)
					.join(','),
			});
			const auditDetails = sanitizeAuditDetails({
				fieldsChanged: [
					args.title !== undefined ? 'title' : null,
					args.body !== undefined ? 'body' : null,
					args.state !== undefined ? 'state' : null,
					args.labels !== undefined ? 'labels' : null,
				]
					.filter((value): value is string => value !== null)
					.join(','),
				labelsCount: args.labels?.length,
			});
			const request = {
				actor,
				effect: 'update issue',
				resource,
				method: 'PATCH' as const,
				path: `/repos/{owner}/{repository}/issues/${String(args.issue)}`,
				idempotencyKey: args.idempotencyKey,
			};
			const repo = resolveRepo<{ issue: ReturnType<typeof mapIssue> }>(
				options.context,
				args,
				{
					nowIso,
					request,
					details: preflightDetails,
				},
			);
			if ('ok' in repo) return repo;
			const result = await executor.execute({
				...maybeConfirm(args.confirm),
				actor,
				effect: 'update issue',
				resource: `${repo.owner}/${repo.repository}#issue-${String(args.issue)}`,
				method: 'PATCH',
				path: `/repos/${repo.owner}/${repo.repository}/issues/${String(args.issue)}`,
				...maybeIdempotencyKey(args.idempotencyKey),
				body: JSON.stringify({
					...(args.title !== undefined ? { title: args.title } : {}),
					...(args.body !== undefined ? { body: args.body } : {}),
					...(args.state !== undefined ? { state: args.state } : {}),
					...(args.labels !== undefined
						? { labels: [...args.labels] }
						: {}),
				}),
				responseSchema: IssueResponseSchema,
				...maybeAuditDetails(auditDetails),
			});
			return mapMutationResult(
				result,
				(data) => ({ issue: mapIssue(data) }),
				(existing) => ({ issue: mapIssue(existing) }),
			);
		},

		async createIssueComment(args: IGitHubIssueCommentCreateArgs) {
			const actor = actorOf(args.actor);
			const issue = String(args.issue);
			const auditDetails = sanitizeAuditDetails({
				bodyLength: args.body.length,
			});
			const request = {
				actor,
				effect: 'create issue comment',
				resource: `${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}#issue-${issue}`,
				method: 'POST' as const,
				path: `/repos/{owner}/{repository}/issues/${issue}/comments`,
				idempotencyKey: args.idempotencyKey,
			};
			const repo = resolveRepo<{
				issueNumber: string;
				comment: ReturnType<typeof mapComment>;
			}>(options.context, args, {
				nowIso,
				request,
				details: auditDetails,
			});
			if ('ok' in repo) return repo;
			const result = await executor.execute({
				...maybeConfirm(args.confirm),
				actor,
				effect: 'create issue comment',
				resource: `${repo.owner}/${repo.repository}#issue-${issue}`,
				method: 'POST',
				path: `/repos/${repo.owner}/${repo.repository}/issues/${issue}/comments`,
				...maybeIdempotencyKey(args.idempotencyKey),
				body: JSON.stringify({ body: args.body }),
				responseSchema: CommentResponseSchema,
				...maybeAuditDetails(auditDetails),
			});
			return mapMutationResult(
				result,
				(data) => ({ issueNumber: issue, comment: mapComment(data) }),
				(existing) => ({
					issueNumber: issue,
					comment: mapComment(existing),
				}),
			);
		},

		async dispatchWorkflow(args: IGitHubWorkflowDispatchArgs) {
			const actor = actorOf(args.actor);
			const workflowId = String(args.workflowId);
			const defaultIdempotencyKey = `workflow-dispatch:${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}:${workflowId}:${args.ref}:${stableJson(args.inputs ?? {})}`;
			const auditDetails = sanitizeAuditDetails({
				inputKeys: Object.keys(args.inputs ?? {}).join(',') || null,
			});
			const request = {
				actor,
				effect: 'dispatch workflow',
				resource: `${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}#workflow-${workflowId}@${args.ref}`,
				method: 'POST' as const,
				path: `/repos/{owner}/{repository}/actions/workflows/${workflowId}/dispatches`,
				idempotencyKey: args.idempotencyKey ?? defaultIdempotencyKey,
			};
			const repo = resolveRepo<{
				workflowId: string;
				ref: string;
				dispatched: true;
				inputs?: Readonly<Record<string, string>>;
			}>(options.context, args, {
				nowIso,
				request,
				details: auditDetails,
			});
			if ('ok' in repo) return repo;
			const result = await executor.execute({
				...maybeConfirm(args.confirm),
				actor,
				effect: 'dispatch workflow',
				resource: `${repo.owner}/${repo.repository}#workflow-${workflowId}@${args.ref}`,
				method: 'POST',
				path: `/repos/${repo.owner}/${repo.repository}/actions/workflows/${workflowId}/dispatches`,
				...maybeIdempotencyKey(
					args.idempotencyKey ?? defaultIdempotencyKey,
				),
				body: JSON.stringify({
					ref: args.ref,
					...(args.inputs !== undefined
						? { inputs: args.inputs }
						: {}),
				}),
				parseAs: 'text',
				responseSchema: EmptyTextSchema,
				...maybeAuditDetails(auditDetails),
			});
			return mapMutationResult(
				result,
				() => ({
					workflowId,
					ref: args.ref,
					dispatched: true as const,
					...(args.inputs !== undefined
						? { inputs: args.inputs }
						: {}),
				}),
				() => ({
					workflowId,
					ref: args.ref,
					dispatched: true as const,
					...(args.inputs !== undefined
						? { inputs: args.inputs }
						: {}),
				}),
			);
		},

		async dispatchRepository(args: IGitHubRepositoryDispatchArgs) {
			const actor = actorOf(args.actor);
			const defaultIdempotencyKey = `repository-dispatch:${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}:${args.eventType}:${stableJson(args.clientPayload ?? {})}`;
			const auditDetails = sanitizeAuditDetails({
				payloadKeys:
					Object.keys(args.clientPayload ?? {}).join(',') || null,
			});
			const request = {
				actor,
				effect: 'dispatch repository event',
				resource: `${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}#event-${args.eventType}`,
				method: 'POST' as const,
				path: '/repos/{owner}/{repository}/dispatches',
				idempotencyKey: args.idempotencyKey ?? defaultIdempotencyKey,
			};
			const repo = resolveRepo<{
				eventType: string;
				dispatched: true;
				clientPayloadKeys: string[];
			}>(options.context, args, {
				nowIso,
				request,
				details: auditDetails,
			});
			if ('ok' in repo) return repo;
			const result = await executor.execute({
				...maybeConfirm(args.confirm),
				actor,
				effect: 'dispatch repository event',
				resource: `${repo.owner}/${repo.repository}#event-${args.eventType}`,
				method: 'POST',
				path: `/repos/${repo.owner}/${repo.repository}/dispatches`,
				...maybeIdempotencyKey(
					args.idempotencyKey ?? defaultIdempotencyKey,
				),
				body: JSON.stringify({
					event_type: args.eventType,
					...(args.clientPayload !== undefined
						? { client_payload: args.clientPayload }
						: {}),
				}),
				parseAs: 'text',
				responseSchema: EmptyTextSchema,
				...maybeAuditDetails(auditDetails),
			});
			return mapMutationResult(
				result,
				() => ({
					eventType: args.eventType,
					dispatched: true as const,
					clientPayloadKeys: Object.keys(args.clientPayload ?? {}),
				}),
				() => ({
					eventType: args.eventType,
					dispatched: true as const,
					clientPayloadKeys: Object.keys(args.clientPayload ?? {}),
				}),
			);
		},

		async createRelease(args: IGitHubReleaseCreateArgs) {
			const actor = actorOf(args.actor);
			const defaultIdempotencyKey = `release-create:${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}:${args.tagName}`;
			const auditDetails = sanitizeAuditDetails({
				tagName: args.tagName,
				draft: args.draft,
				prerelease: args.prerelease,
				generateReleaseNotes: args.generateReleaseNotes,
			});
			const preflightDetails = sanitizeAuditDetails({
				tagName: args.tagName,
				draft: args.draft,
				prerelease: args.prerelease,
			});
			const request = {
				actor,
				effect: 'create release',
				resource: `${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}#release-${args.tagName}`,
				method: 'POST' as const,
				path: '/repos/{owner}/{repository}/releases',
				idempotencyKey: args.idempotencyKey ?? defaultIdempotencyKey,
			};
			const repo = resolveRepo<{
				release: ReturnType<typeof mapRelease>;
			}>(options.context, args, {
				nowIso,
				request,
				details: preflightDetails,
			});
			if ('ok' in repo) return repo;
			const result = await executor.execute({
				...maybeConfirm(args.confirm),
				actor,
				effect: 'create release',
				resource: `${repo.owner}/${repo.repository}#release-${args.tagName}`,
				method: 'POST',
				path: `/repos/${repo.owner}/${repo.repository}/releases`,
				...maybeIdempotencyKey(
					args.idempotencyKey ?? defaultIdempotencyKey,
				),
				body: JSON.stringify({
					tag_name: args.tagName,
					...(args.targetCommitish !== undefined
						? { target_commitish: args.targetCommitish }
						: {}),
					...(args.name !== undefined ? { name: args.name } : {}),
					...(args.body !== undefined ? { body: args.body } : {}),
					...(args.draft !== undefined ? { draft: args.draft } : {}),
					...(args.prerelease !== undefined
						? { prerelease: args.prerelease }
						: {}),
					...(args.generateReleaseNotes !== undefined
						? { generate_release_notes: args.generateReleaseNotes }
						: {}),
				}),
				responseSchema: ReleaseResponseSchema,
				...maybeAuditDetails(auditDetails),
				classifyDuplicate: releaseDuplicateClassifier,
			});
			return mapMutationResult(
				result,
				(data) => ({ release: mapRelease(data) }),
				(existing) => ({ release: mapRelease(existing) }),
			);
		},

		async updateRelease(args: IGitHubReleaseUpdateArgs) {
			const actor = actorOf(args.actor);
			const releaseId = String(args.releaseId);
			const auditDetails = sanitizeAuditDetails({ releaseId });
			const request = {
				actor,
				effect: 'update release',
				resource: `${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}#release-${releaseId}`,
				method: 'PATCH' as const,
				path: `/repos/{owner}/{repository}/releases/${releaseId}`,
				idempotencyKey: args.idempotencyKey,
			};
			const repo = resolveRepo<{
				release: ReturnType<typeof mapRelease>;
			}>(options.context, args, {
				nowIso,
				request,
				details: auditDetails,
			});
			if ('ok' in repo) return repo;
			const result = await executor.execute({
				...maybeConfirm(args.confirm),
				actor,
				effect: 'update release',
				resource: `${repo.owner}/${repo.repository}#release-${releaseId}`,
				method: 'PATCH',
				path: `/repos/${repo.owner}/${repo.repository}/releases/${releaseId}`,
				...maybeIdempotencyKey(args.idempotencyKey),
				body: JSON.stringify({
					...(args.tagName !== undefined
						? { tag_name: args.tagName }
						: {}),
					...(args.targetCommitish !== undefined
						? { target_commitish: args.targetCommitish }
						: {}),
					...(args.name !== undefined ? { name: args.name } : {}),
					...(args.body !== undefined ? { body: args.body } : {}),
					...(args.draft !== undefined ? { draft: args.draft } : {}),
					...(args.prerelease !== undefined
						? { prerelease: args.prerelease }
						: {}),
					...(args.generateReleaseNotes !== undefined
						? { generate_release_notes: args.generateReleaseNotes }
						: {}),
				}),
				responseSchema: ReleaseResponseSchema,
				...maybeAuditDetails(auditDetails),
			});
			return mapMutationResult(
				result,
				(data) => ({ release: mapRelease(data) }),
				(existing) => ({ release: mapRelease(existing) }),
			);
		},

		async deleteRelease(args: IGitHubReleaseDeleteArgs) {
			const actor = actorOf(args.actor);
			const releaseId = String(args.releaseId);
			const defaultIdempotencyKey = `release-delete:${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}:${releaseId}`;
			const auditDetails = sanitizeAuditDetails({ releaseId });
			const request = {
				actor,
				effect: 'delete release',
				resource: `${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}#release-${releaseId}`,
				method: 'DELETE' as const,
				path: `/repos/{owner}/{repository}/releases/${releaseId}`,
				idempotencyKey: args.idempotencyKey ?? defaultIdempotencyKey,
			};
			const repo = resolveRepo<{ releaseId: string; deleted: true }>(
				options.context,
				args,
				{
					nowIso,
					request,
					details: auditDetails,
				},
			);
			if ('ok' in repo) return repo;
			const result = await executor.execute({
				...maybeConfirm(args.confirm),
				actor,
				effect: 'delete release',
				resource: `${repo.owner}/${repo.repository}#release-${releaseId}`,
				method: 'DELETE',
				path: `/repos/${repo.owner}/${repo.repository}/releases/${releaseId}`,
				...maybeIdempotencyKey(
					args.idempotencyKey ?? defaultIdempotencyKey,
				),
				parseAs: 'text',
				responseSchema: EmptyTextSchema,
				...maybeAuditDetails(auditDetails),
			});
			return mapMutationResult(
				result,
				() => ({ releaseId, deleted: true as const }),
				() => ({ releaseId, deleted: true as const }),
			);
		},

		async createTag(args: IGitHubTagCreateArgs) {
			const actor = actorOf(args.actor);
			const defaultIdempotencyKey = `tag-create:${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}:${args.tagName}:${args.sha}`;
			const auditDetails = sanitizeAuditDetails({
				tagName: args.tagName,
			});
			const request = {
				actor,
				effect: 'create tag ref',
				resource: `${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}#tag-${args.tagName}`,
				method: 'POST' as const,
				path: '/repos/{owner}/{repository}/git/refs',
				idempotencyKey: args.idempotencyKey ?? defaultIdempotencyKey,
			};
			const repo = resolveRepo<{ tag: ReturnType<typeof mapCreatedTag> }>(
				options.context,
				args,
				{
					nowIso,
					request,
					details: auditDetails,
				},
			);
			if ('ok' in repo) return repo;
			const result = await executor.execute({
				...maybeConfirm(args.confirm),
				actor,
				effect: 'create tag ref',
				resource: `${repo.owner}/${repo.repository}#tag-${args.tagName}`,
				method: 'POST',
				path: `/repos/${repo.owner}/${repo.repository}/git/refs`,
				...maybeIdempotencyKey(
					args.idempotencyKey ?? defaultIdempotencyKey,
				),
				body: JSON.stringify({
					ref: `refs/tags/${args.tagName}`,
					sha: args.sha,
				}),
				responseSchema: RefResponseSchema,
				...maybeAuditDetails(auditDetails),
				classifyDuplicate: tagDuplicateClassifier,
			});
			return mapMutationResult(
				result,
				(data) => ({ tag: mapCreatedTag(data) }),
				(existing) => ({ tag: mapCreatedTag(existing) }),
			);
		},

		async deleteTag(args: IGitHubTagDeleteArgs) {
			const actor = actorOf(args.actor);
			const defaultIdempotencyKey = `tag-delete:${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}:${args.tagName}`;
			const auditDetails = sanitizeAuditDetails({
				tagName: args.tagName,
			});
			const request = {
				actor,
				effect: 'delete tag ref',
				resource: `${args.owner ?? options.context.repository?.owner ?? '?'}/${args.repository ?? options.context.repository?.repository ?? '?'}#tag-${args.tagName}`,
				method: 'DELETE' as const,
				path: `/repos/{owner}/{repository}/git/refs/tags/${args.tagName}`,
				idempotencyKey: args.idempotencyKey ?? defaultIdempotencyKey,
			};
			const repo = resolveRepo<{ tag: { name: string; deleted: true } }>(
				options.context,
				args,
				{
					nowIso,
					request,
					details: auditDetails,
				},
			);
			if ('ok' in repo) return repo;
			const result = await executor.execute({
				...maybeConfirm(args.confirm),
				actor,
				effect: 'delete tag ref',
				resource: `${repo.owner}/${repo.repository}#tag-${args.tagName}`,
				method: 'DELETE',
				path: `/repos/${repo.owner}/${repo.repository}/git/refs/tags/${args.tagName}`,
				...maybeIdempotencyKey(
					args.idempotencyKey ?? defaultIdempotencyKey,
				),
				parseAs: 'text',
				responseSchema: EmptyTextSchema,
				...maybeAuditDetails(auditDetails),
			});
			return mapMutationResult(
				result,
				() => ({ tag: { name: args.tagName, deleted: true as const } }),
				() => ({ tag: { name: args.tagName, deleted: true as const } }),
			);
		},
	};
};

export type GitHubIssueMutationResult = Awaited<
	ReturnType<ReturnType<typeof createGitHubMutations>['updateIssue']>
>;

export type GitHubIssueCommentMutationResult = Awaited<
	ReturnType<ReturnType<typeof createGitHubMutations>['createIssueComment']>
>;

export type GitHubWorkflowDispatchMutationResult = Awaited<
	ReturnType<ReturnType<typeof createGitHubMutations>['dispatchWorkflow']>
>;

export type GitHubRepositoryDispatchMutationResult = Awaited<
	ReturnType<ReturnType<typeof createGitHubMutations>['dispatchRepository']>
>;

export type GitHubReleaseMutationResult = Awaited<
	ReturnType<ReturnType<typeof createGitHubMutations>['createRelease']>
>;

export type GitHubReleaseDeleteMutationResult = Awaited<
	ReturnType<ReturnType<typeof createGitHubMutations>['deleteRelease']>
>;

export type GitHubTagMutationResult = Awaited<
	ReturnType<ReturnType<typeof createGitHubMutations>['createTag']>
>;

export type GitHubTagDeleteMutationResult = Awaited<
	ReturnType<ReturnType<typeof createGitHubMutations>['deleteTag']>
>;
