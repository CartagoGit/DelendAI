import type {
	IRemoteMutationDuplicateInfo,
	IRemoteMutationError,
	RemoteMutationResult,
} from '@mcp-vertex/contracts/remote-mutations';
import {
	createRemoteMutationExecutor,
	type IRemoteHttpClientDeps,
} from '../../../remote-provider-core/src/index';
import z from 'zod';

import type { IGitLabProviderContext } from './config';

const OBJECT_SCHEMA = z.object({}).passthrough();
const DUPLICATE_HINT =
	/(already exists|has already been taken|tag .*exists|release .*exists|duplicate)/i;

type ProjectRefInput = {
	readonly projectId?: string | number;
	readonly projectPath?: string;
};

type MutationBaseInput = ProjectRefInput & {
	readonly confirm?: boolean;
	readonly actor: string;
	readonly idempotencyKey?: string;
};

export interface IGitLabIssueCreateInput extends MutationBaseInput {
	readonly title: string;
	readonly description?: string;
	readonly labels?: readonly string[];
	readonly confidential?: boolean;
}

export interface IGitLabIssueUpdateInput extends MutationBaseInput {
	readonly iid: string | number;
	readonly title?: string;
	readonly description?: string;
	readonly labels?: readonly string[];
	readonly confidential?: boolean;
	readonly stateEvent?: 'close' | 'reopen';
}

export interface IGitLabIssueCommentInput extends MutationBaseInput {
	readonly iid: string | number;
	readonly body: string;
}

export interface IGitLabMergeRequestDiscussionCreateInput
	extends MutationBaseInput {
	readonly iid: string | number;
	readonly body: string;
}

export interface IGitLabMergeRequestDiscussionReplyInput
	extends MutationBaseInput {
	readonly iid: string | number;
	readonly discussionId: string;
	readonly body: string;
}

export interface IGitLabPipelineMutationInput extends MutationBaseInput {
	readonly id: string | number;
}

export interface IGitLabJobMutationInput extends MutationBaseInput {
	readonly id: string | number;
}

export interface IGitLabCreateTagInput extends MutationBaseInput {
	readonly tagName: string;
	readonly ref: string;
	readonly message?: string;
}

export interface IGitLabCreateReleaseInput extends MutationBaseInput {
	readonly tagName: string;
	readonly name?: string;
	readonly description?: string;
	readonly ref?: string;
	readonly releasedAt?: string;
}

export interface IGitLabMutationAdapter {
	readonly createIssue: (
		input: IGitLabIssueCreateInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly updateIssue: (
		input: IGitLabIssueUpdateInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly createIssueComment: (
		input: IGitLabIssueCommentInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly createMergeRequestDiscussion: (
		input: IGitLabMergeRequestDiscussionCreateInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly replyMergeRequestDiscussion: (
		input: IGitLabMergeRequestDiscussionReplyInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly retryPipeline: (
		input: IGitLabPipelineMutationInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly cancelPipeline: (
		input: IGitLabPipelineMutationInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly retryJob: (
		input: IGitLabJobMutationInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly cancelJob: (
		input: IGitLabJobMutationInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly createTag: (
		input: IGitLabCreateTagInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
	readonly createRelease: (
		input: IGitLabCreateReleaseInput,
	) => Promise<RemoteMutationResult<Record<string, unknown>>>;
}

export interface IGitLabMutationAdapterOptions {
	readonly context: IGitLabProviderContext;
	readonly nowIso?: () => string;
}

const requireText = (value: string, label: string): string => {
	const normalized = value.trim();
	if (normalized.length === 0) {
		throw new Error(`${label} is required`);
	}
	return normalized;
};

const resolveProjectRef = (
	context: IGitLabProviderContext,
	projectId?: string | number,
	projectPath?: string,
): { readonly encoded: string; readonly display: string } => {
	if (projectId !== undefined) {
		return {
			encoded: encodeURIComponent(String(projectId)),
			display: String(projectId),
		};
	}
	if (projectPath !== undefined && projectPath.trim() !== '') {
		return {
			encoded: encodeURIComponent(projectPath.trim()),
			display: projectPath.trim(),
		};
	}
	if (context.project?.projectId !== undefined) {
		return {
			encoded: encodeURIComponent(String(context.project.projectId)),
			display: String(context.project.projectId),
		};
	}
	if (
		context.project?.projectPath !== undefined &&
		context.project.projectPath.trim() !== ''
	) {
		return {
			encoded: encodeURIComponent(context.project.projectPath),
			display: context.project.projectPath,
		};
	}
	throw new Error(
		'a projectId or projectPath is required for this GitLab mutation',
	);
};

const joinLabels = (
	labels: readonly string[] | undefined,
): string | undefined => {
	if (labels === undefined) return undefined;
	const normalized = labels
		.map((label) => label.trim())
		.filter((label) => label.length > 0);
	return normalized.length > 0 ? normalized.join(',') : undefined;
};

const bodyOf = (
	fields: Readonly<
		Record<string, string | number | boolean | null | undefined>
	>,
): string =>
	JSON.stringify(
		Object.fromEntries(
			Object.entries(fields).filter(([, value]) => value !== undefined),
		),
	);

const contentRedactions = (
	values: readonly (string | undefined)[],
): readonly string[] =>
	values
		.filter((value): value is string => typeof value === 'string')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

const duplicateBodySample = (
	error: IRemoteMutationError | undefined,
): string => {
	const sample = error?.details?.bodySample;
	return typeof sample === 'string' ? sample : '';
};

const duplicateFromError = (
	error: IRemoteMutationError | undefined,
	message: string,
): IRemoteMutationDuplicateInfo<Record<string, unknown>> | null => {
	if (error === undefined) return null;
	if (error.status !== 400 && error.status !== 409 && error.status !== 422) {
		return null;
	}
	if (
		!DUPLICATE_HINT.test(`${error.message} ${duplicateBodySample(error)}`)
	) {
		return null;
	}
	return { message };
};

const defaultIdempotencyKey = (
	prefix: string,
	parts: readonly (string | number)[],
	override: string | undefined,
): string =>
	override?.trim() ||
	`${prefix}:${parts.map((part) => String(part)).join(':')}`;

const apiPath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path;

const withOptionalConfirm = (confirm: boolean | undefined) =>
	confirm === undefined ? {} : { confirm };

export const createGitLabMutationAdapter = (
	options: IGitLabMutationAdapterOptions,
	deps: IRemoteHttpClientDeps,
): IGitLabMutationAdapter => {
	const executor = createRemoteMutationExecutor(
		{
			provider: 'gitlab',
			baseUrl: options.context.apiBaseUrl,
			token: options.context.token,
			timeoutMs: options.context.timeoutMs,
			retryBaseDelayMs: options.context.retryBaseDelayMs,
			...(options.nowIso === undefined ? {} : { nowIso: options.nowIso }),
		},
		deps,
	);

	return {
		createIssue(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			const title = requireText(input.title, 'title');
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'create issue',
				resource: `${project.display}#issue:new`,
				method: 'POST',
				path: apiPath(`/projects/${project.encoded}/issues`),
				body: bodyOf({
					title,
					description: input.description,
					labels: joinLabels(input.labels),
					confidential: input.confidential,
				}),
				headers: { 'content-type': 'application/json' },
				responseSchema: OBJECT_SCHEMA,
				auditDetails: {
					project: project.display,
					titleLength: title.length,
					descriptionLength: input.description?.length ?? 0,
				},
				redactValues: contentRedactions([title, input.description]),
			});
		},
		updateIssue(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'update issue',
				resource: `${project.display}#issue:${String(input.iid)}`,
				method: 'PUT',
				path: apiPath(
					`/projects/${project.encoded}/issues/${encodeURIComponent(String(input.iid))}`,
				),
				body: bodyOf({
					title: input.title,
					description: input.description,
					labels: joinLabels(input.labels),
					confidential: input.confidential,
					state_event: input.stateEvent,
				}),
				headers: { 'content-type': 'application/json' },
				responseSchema: OBJECT_SCHEMA,
				auditDetails: {
					project: project.display,
					iid: String(input.iid),
					stateEvent: input.stateEvent ?? null,
				},
				redactValues: contentRedactions([
					input.title,
					input.description,
				]),
			});
		},
		createIssueComment(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			const body = requireText(input.body, 'body');
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'create issue comment',
				resource: `${project.display}#issue:${String(input.iid)}:comment`,
				method: 'POST',
				path: apiPath(
					`/projects/${project.encoded}/issues/${encodeURIComponent(String(input.iid))}/notes`,
				),
				body: bodyOf({ body }),
				headers: { 'content-type': 'application/json' },
				responseSchema: OBJECT_SCHEMA,
				auditDetails: {
					project: project.display,
					iid: String(input.iid),
					bodyLength: body.length,
				},
				redactValues: contentRedactions([body]),
			});
		},
		createMergeRequestDiscussion(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			const body = requireText(input.body, 'body');
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'create merge request discussion',
				resource: `${project.display}#merge-request:${String(input.iid)}:discussion`,
				method: 'POST',
				path: apiPath(
					`/projects/${project.encoded}/merge_requests/${encodeURIComponent(String(input.iid))}/discussions`,
				),
				body: bodyOf({ body }),
				headers: { 'content-type': 'application/json' },
				responseSchema: OBJECT_SCHEMA,
				auditDetails: {
					project: project.display,
					iid: String(input.iid),
					bodyLength: body.length,
				},
				redactValues: contentRedactions([body]),
			});
		},
		replyMergeRequestDiscussion(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			const body = requireText(input.body, 'body');
			const discussionId = requireText(
				input.discussionId,
				'discussionId',
			);
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'reply merge request discussion',
				resource: `${project.display}#merge-request:${String(input.iid)}:discussion:${discussionId}`,
				method: 'POST',
				path: apiPath(
					`/projects/${project.encoded}/merge_requests/${encodeURIComponent(String(input.iid))}/discussions/${encodeURIComponent(discussionId)}/notes`,
				),
				body: bodyOf({ body }),
				headers: { 'content-type': 'application/json' },
				responseSchema: OBJECT_SCHEMA,
				auditDetails: {
					project: project.display,
					iid: String(input.iid),
					discussionId,
					bodyLength: body.length,
				},
				redactValues: contentRedactions([body]),
			});
		},
		retryPipeline(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'retry pipeline',
				resource: `${project.display}#pipeline:${String(input.id)}`,
				method: 'POST',
				path: apiPath(
					`/projects/${project.encoded}/pipelines/${encodeURIComponent(String(input.id))}/retry`,
				),
				responseSchema: OBJECT_SCHEMA,
				idempotencyKey: defaultIdempotencyKey(
					'gitlab:pipeline:retry',
					[project.display, input.id],
					input.idempotencyKey,
				),
				auditDetails: {
					project: project.display,
					pipelineId: String(input.id),
				},
			});
		},
		cancelPipeline(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'cancel pipeline',
				resource: `${project.display}#pipeline:${String(input.id)}`,
				method: 'POST',
				path: apiPath(
					`/projects/${project.encoded}/pipelines/${encodeURIComponent(String(input.id))}/cancel`,
				),
				responseSchema: OBJECT_SCHEMA,
				idempotencyKey: defaultIdempotencyKey(
					'gitlab:pipeline:cancel',
					[project.display, input.id],
					input.idempotencyKey,
				),
				auditDetails: {
					project: project.display,
					pipelineId: String(input.id),
				},
			});
		},
		retryJob(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'retry job',
				resource: `${project.display}#job:${String(input.id)}`,
				method: 'POST',
				path: apiPath(
					`/projects/${project.encoded}/jobs/${encodeURIComponent(String(input.id))}/retry`,
				),
				responseSchema: OBJECT_SCHEMA,
				idempotencyKey: defaultIdempotencyKey(
					'gitlab:job:retry',
					[project.display, input.id],
					input.idempotencyKey,
				),
				auditDetails: {
					project: project.display,
					jobId: String(input.id),
				},
			});
		},
		cancelJob(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'cancel job',
				resource: `${project.display}#job:${String(input.id)}`,
				method: 'POST',
				path: apiPath(
					`/projects/${project.encoded}/jobs/${encodeURIComponent(String(input.id))}/cancel`,
				),
				responseSchema: OBJECT_SCHEMA,
				idempotencyKey: defaultIdempotencyKey(
					'gitlab:job:cancel',
					[project.display, input.id],
					input.idempotencyKey,
				),
				auditDetails: {
					project: project.display,
					jobId: String(input.id),
				},
			});
		},
		createTag(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			const tagName = requireText(input.tagName, 'tagName');
			const ref = requireText(input.ref, 'ref');
			const message = input.message?.trim();
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'create tag',
				resource: `${project.display}#tag:${tagName}`,
				method: 'POST',
				path: apiPath(`/projects/${project.encoded}/repository/tags`),
				body: bodyOf({ tag_name: tagName, ref, message }),
				headers: { 'content-type': 'application/json' },
				responseSchema: OBJECT_SCHEMA,
				idempotencyKey: defaultIdempotencyKey(
					'gitlab:tag:create',
					[project.display, tagName],
					input.idempotencyKey,
				),
				classifyDuplicate: ({ error }) =>
					duplicateFromError(error, 'tag already exists remotely'),
				auditDetails: {
					project: project.display,
					tagName,
					ref,
					hasMessage: message !== undefined,
				},
				redactValues: contentRedactions([message]),
			});
		},
		createRelease(input) {
			const project = resolveProjectRef(
				options.context,
				input.projectId,
				input.projectPath,
			);
			const tagName = requireText(input.tagName, 'tagName');
			return executor.execute({
				...withOptionalConfirm(input.confirm),
				actor: requireText(input.actor, 'actor'),
				effect: 'create release',
				resource: `${project.display}#release:${tagName}`,
				method: 'POST',
				path: apiPath(`/projects/${project.encoded}/releases`),
				body: bodyOf({
					tag_name: tagName,
					name: input.name,
					description: input.description,
					ref: input.ref,
					released_at: input.releasedAt,
				}),
				headers: { 'content-type': 'application/json' },
				responseSchema: OBJECT_SCHEMA,
				idempotencyKey: defaultIdempotencyKey(
					'gitlab:release:create',
					[project.display, tagName],
					input.idempotencyKey,
				),
				classifyDuplicate: ({ error }) =>
					duplicateFromError(
						error,
						'release already exists remotely',
					),
				auditDetails: {
					project: project.display,
					tagName,
					nameLength: input.name?.length ?? 0,
					descriptionLength: input.description?.length ?? 0,
					hasRef: input.ref !== undefined,
				},
				redactValues: contentRedactions([
					input.name,
					input.description,
				]),
			});
		},
	};
};
