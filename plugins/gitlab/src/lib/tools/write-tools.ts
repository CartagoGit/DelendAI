import type {
	IRemoteMutationError,
	RemoteMutationResult,
} from '@mcp-vertex/contracts/remote-mutations';
import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';
import z from 'zod';

import type { IGitLabMutationAdapter } from '../mutations';
import {
	buildMetaOutput,
	discussionSchema,
	issueSchema,
	jobSchema,
	normalizeDiscussion,
	normalizeIssue,
	normalizeJob,
	normalizeNote,
	normalizePipeline,
	normalizeRelease,
	normalizeTag,
	noteSchema,
	pipelineSchema,
	releaseSchema,
	responseMetaSchema,
	tagSchema,
} from './shared';

const NON_EMPTY = z.string().min(1);

const mutationErrorSchema = z.object({
	code: z.string(),
	provider: z.string(),
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
	nextAction: z.string().optional(),
});

const mutationAuditSchema = z.object({
	provider: z.string(),
	actor: z.string(),
	effect: z.string(),
	resource: z.string(),
	timestamp: z.string(),
	request: z.object({
		method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
		path: z.string(),
	}),
	remote: z.object({
		status: z.number().int().nullable(),
		requestId: z.string().nullable(),
		attempts: z.number().int().nonnegative(),
		duplicate: z.boolean(),
	}),
	idempotency: z.object({
		key: z.string().nullable(),
		replay: z.boolean(),
	}),
	details: z
		.record(
			z.string(),
			z.union([z.string(), z.number(), z.boolean(), z.null()]),
		)
		.optional(),
});

const duplicateSchema = z.object({
	message: z.string(),
	existing: z.unknown().optional(),
});

const mutationCommonSchema = z.object({
	ok: z.boolean(),
	outcome: z.enum(['applied', 'duplicate', 'rejected', 'failed']),
	provider: z.literal('gitlab'),
	error: mutationErrorSchema.optional(),
	duplicate: duplicateSchema.optional(),
	audit: mutationAuditSchema,
	idempotentReplay: z.boolean(),
	meta: responseMetaSchema.nullable().optional(),
});

const issueWriteOutputSchema = mutationCommonSchema.extend({
	issue: issueSchema.nullable().optional(),
	comment: noteSchema.nullable().optional(),
});

const discussionWriteOutputSchema = mutationCommonSchema.extend({
	discussion: discussionSchema.nullable().optional(),
	comment: noteSchema.nullable().optional(),
});

const pipelineWriteOutputSchema = mutationCommonSchema.extend({
	pipeline: pipelineSchema.nullable().optional(),
});

const jobWriteOutputSchema = mutationCommonSchema.extend({
	job: jobSchema.nullable().optional(),
});

const releaseWriteOutputSchema = mutationCommonSchema.extend({
	release: releaseSchema.nullable().optional(),
	tag: tagSchema.nullable().optional(),
});

const PROJECT_FIELDS = {
	projectId: z.union([z.string(), z.number()]).optional(),
	projectPath: z.string().optional(),
};

export interface IGitLabWriteToolOptions {
	readonly namespacePrefix: string;
	readonly adapter: IGitLabMutationAdapter;
}

const withCommon = <TData>(
	result: RemoteMutationResult<TData>,
	extra: Record<string, unknown> = {},
) => ({
	ok: result.ok,
	outcome: result.outcome,
	provider: result.provider,
	...(result.ok
		? {
				meta:
					'meta' in result && result.meta !== null
						? buildMetaOutput(result.meta)
						: null,
			}
		: { error: result.error as IRemoteMutationError }),
	...(result.outcome === 'duplicate' ? { duplicate: result.duplicate } : {}),
	audit: result.audit,
	idempotentReplay: result.idempotentReplay,
	...extra,
});

const withOptionalProject = (
	projectId: string | number | undefined,
	projectPath: string | undefined,
) => ({
	...(projectId === undefined ? {} : { projectId }),
	...(projectPath === undefined ? {} : { projectPath }),
});

const withOptionalMutationInputs = (
	confirm: boolean | undefined,
	idempotencyKey: string | undefined,
) => ({
	...(confirm === undefined ? {} : { confirm }),
	...(idempotencyKey === undefined ? {} : { idempotencyKey }),
});

export const buildGitLabWriteToolRegistrations = (
	options: IGitLabWriteToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'issue_write',
			summary: 'Create, update or comment on a GitLab issue.',
			tags: ['gitlab', 'write'],
			effects: ['network', 'write'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_issue_write`,
					{
						description:
							'Create, update or comment on a GitLab issue. Opt-in via plugins.gitlab.options.allowWrite:true and every mutation requires confirm:true.',
						inputSchema: z
							.object({
								action: z.enum(['create', 'update', 'comment']),
								...PROJECT_FIELDS,
								actor: NON_EMPTY,
								confirm: z.boolean().optional(),
								idempotencyKey: z.string().min(1).optional(),
								iid: z
									.union([z.string(), z.number()])
									.optional(),
								title: z.string().optional(),
								description: z.string().optional(),
								labels: z.array(z.string()).optional(),
								confidential: z.boolean().optional(),
								stateEvent: z
									.enum(['close', 'reopen'])
									.optional(),
								body: z.string().optional(),
							})
							.strict(),
						outputSchema: issueWriteOutputSchema,
					},
					async (rawArgs: unknown) => {
						const args = rawArgs as {
							action: 'create' | 'update' | 'comment';
							projectId?: string | number;
							projectPath?: string;
							actor: string;
							confirm?: boolean;
							idempotencyKey?: string;
							iid?: string | number;
							title?: string;
							description?: string;
							labels?: readonly string[];
							confidential?: boolean;
							stateEvent?: 'close' | 'reopen';
							body?: string;
						};
						if (args.action === 'create') {
							if (args.title === undefined)
								throw new Error('title is required for create');
							const result = await options.adapter.createIssue({
								...withOptionalProject(
									args.projectId,
									args.projectPath,
								),
								actor: args.actor,
								...withOptionalMutationInputs(
									args.confirm,
									args.idempotencyKey,
								),
								title: args.title,
								...(args.description === undefined
									? {}
									: { description: args.description }),
								...(args.labels === undefined
									? {}
									: { labels: args.labels }),
								...(args.confidential === undefined
									? {}
									: { confidential: args.confidential }),
							});
							return toolJson(
								withCommon(result, {
									issue:
										result.ok &&
										result.outcome === 'applied'
											? normalizeIssue(result.data)
											: null,
								}),
							);
						}
						if (args.action === 'update') {
							if (args.iid === undefined)
								throw new Error('iid is required for update');
							const result = await options.adapter.updateIssue({
								...args,
								iid: args.iid,
							});
							return toolJson(
								withCommon(result, {
									issue:
										result.ok &&
										result.outcome === 'applied'
											? normalizeIssue(result.data)
											: null,
								}),
							);
						}
						if (args.iid === undefined)
							throw new Error('iid is required for comment');
						if (args.body === undefined)
							throw new Error('body is required for comment');
						const result = await options.adapter.createIssueComment(
							{ ...args, iid: args.iid, body: args.body },
						);
						return toolJson(
							withCommon(result, {
								comment:
									result.ok && result.outcome === 'applied'
										? normalizeNote(result.data)
										: null,
							}),
						);
					},
				);
			},
		},
		{
			id: 'discussion_write',
			summary: 'Create or reply to a GitLab merge request discussion.',
			tags: ['gitlab', 'write'],
			effects: ['network', 'write'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_discussion_write`,
					{
						description:
							'Create a new merge request discussion or reply to an existing one. Opt-in via plugins.gitlab.options.allowWrite:true and every mutation requires confirm:true.',
						inputSchema: z
							.object({
								action: z.enum(['create', 'reply']),
								...PROJECT_FIELDS,
								actor: NON_EMPTY,
								confirm: z.boolean().optional(),
								idempotencyKey: z.string().min(1).optional(),
								iid: z.union([z.string(), z.number()]),
								discussionId: z.string().optional(),
								body: z.string(),
							})
							.strict(),
						outputSchema: discussionWriteOutputSchema,
					},
					async (rawArgs: unknown) => {
						const args = rawArgs as {
							action: 'create' | 'reply';
							projectId?: string | number;
							projectPath?: string;
							actor: string;
							confirm?: boolean;
							idempotencyKey?: string;
							iid: string | number;
							discussionId?: string;
							body: string;
						};
						if (args.action === 'create') {
							const result =
								await options.adapter.createMergeRequestDiscussion(
									args,
								);
							return toolJson(
								withCommon(result, {
									discussion:
										result.ok &&
										result.outcome === 'applied'
											? normalizeDiscussion(result.data)
											: null,
								}),
							);
						}
						if (args.discussionId === undefined)
							throw new Error(
								'discussionId is required for reply',
							);
						const result =
							await options.adapter.replyMergeRequestDiscussion({
								...args,
								discussionId: args.discussionId,
							});
						return toolJson(
							withCommon(result, {
								comment:
									result.ok && result.outcome === 'applied'
										? normalizeNote(result.data)
										: null,
							}),
						);
					},
				);
			},
		},
		{
			id: 'pipeline_write',
			summary: 'Retry or cancel a GitLab pipeline.',
			tags: ['gitlab', 'write'],
			effects: ['network', 'write'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_pipeline_write`,
					{
						description:
							'Retry or cancel a GitLab pipeline. Opt-in via plugins.gitlab.options.allowWrite:true and every mutation requires confirm:true.',
						inputSchema: z
							.object({
								action: z.enum(['retry', 'cancel']),
								...PROJECT_FIELDS,
								actor: NON_EMPTY,
								confirm: z.boolean().optional(),
								idempotencyKey: z.string().min(1).optional(),
								id: z.union([z.string(), z.number()]),
							})
							.strict(),
						outputSchema: pipelineWriteOutputSchema,
					},
					async (rawArgs: unknown) => {
						const args = rawArgs as {
							action: 'retry' | 'cancel';
							projectId?: string | number;
							projectPath?: string;
							actor: string;
							confirm?: boolean;
							idempotencyKey?: string;
							id: string | number;
						};
						const result =
							args.action === 'retry'
								? await options.adapter.retryPipeline(args)
								: await options.adapter.cancelPipeline(args);
						return toolJson(
							withCommon(result, {
								pipeline:
									result.ok && result.outcome === 'applied'
										? normalizePipeline(result.data)
										: null,
							}),
						);
					},
				);
			},
		},
		{
			id: 'job_write',
			summary: 'Retry or cancel a GitLab job.',
			tags: ['gitlab', 'write'],
			effects: ['network', 'write'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_job_write`,
					{
						description:
							'Retry or cancel a GitLab job. Opt-in via plugins.gitlab.options.allowWrite:true and every mutation requires confirm:true.',
						inputSchema: z
							.object({
								action: z.enum(['retry', 'cancel']),
								...PROJECT_FIELDS,
								actor: NON_EMPTY,
								confirm: z.boolean().optional(),
								idempotencyKey: z.string().min(1).optional(),
								id: z.union([z.string(), z.number()]),
							})
							.strict(),
						outputSchema: jobWriteOutputSchema,
					},
					async (rawArgs: unknown) => {
						const args = rawArgs as {
							action: 'retry' | 'cancel';
							projectId?: string | number;
							projectPath?: string;
							actor: string;
							confirm?: boolean;
							idempotencyKey?: string;
							id: string | number;
						};
						const result =
							args.action === 'retry'
								? await options.adapter.retryJob(args)
								: await options.adapter.cancelJob(args);
						return toolJson(
							withCommon(result, {
								job:
									result.ok && result.outcome === 'applied'
										? normalizeJob(result.data)
										: null,
							}),
						);
					},
				);
			},
		},
		{
			id: 'release_write',
			summary: 'Create a GitLab release or tag.',
			tags: ['gitlab', 'write'],
			effects: ['network', 'write'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_release_write`,
					{
						description:
							'Create a GitLab release or repository tag. Opt-in via plugins.gitlab.options.allowWrite:true and every mutation requires confirm:true.',
						inputSchema: z
							.object({
								action: z.enum(['release', 'tag']),
								...PROJECT_FIELDS,
								actor: NON_EMPTY,
								confirm: z.boolean().optional(),
								idempotencyKey: z.string().min(1).optional(),
								tagName: NON_EMPTY,
								name: z.string().optional(),
								description: z.string().optional(),
								ref: z.string().optional(),
								releasedAt: z.string().optional(),
								message: z.string().optional(),
							})
							.strict(),
						outputSchema: releaseWriteOutputSchema,
					},
					async (rawArgs: unknown) => {
						const args = rawArgs as {
							action: 'release' | 'tag';
							projectId?: string | number;
							projectPath?: string;
							actor: string;
							confirm?: boolean;
							idempotencyKey?: string;
							tagName: string;
							name?: string;
							description?: string;
							ref?: string;
							releasedAt?: string;
							message?: string;
						};
						if (args.action === 'tag') {
							if (args.ref === undefined)
								throw new Error('ref is required for tag');
							const result = await options.adapter.createTag({
								...withOptionalProject(
									args.projectId,
									args.projectPath,
								),
								actor: args.actor,
								...withOptionalMutationInputs(
									args.confirm,
									args.idempotencyKey,
								),
								tagName: args.tagName,
								ref: args.ref,
								...(args.message === undefined
									? {}
									: { message: args.message }),
							});
							return toolJson(
								withCommon(result, {
									tag:
										result.ok &&
										result.outcome === 'applied'
											? normalizeTag(result.data)
											: null,
								}),
							);
						}
						const result =
							await options.adapter.createRelease(args);
						return toolJson(
							withCommon(result, {
								release:
									result.ok && result.outcome === 'applied'
										? normalizeRelease(result.data)
										: null,
							}),
						);
					},
				);
			},
		},
	];
};
