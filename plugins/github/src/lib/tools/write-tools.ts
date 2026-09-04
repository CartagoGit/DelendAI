import z from 'zod';

import { toolJsonBounded, type IToolRegistration } from '@delendai/core/public';
import type { IRemoteHttpClientDeps } from '@delendai/remote-provider-core';

import type { IGitHubProviderContext } from '../config';
import {
	createGitHubMutations,
	type IGitHubIssueCommentCreateArgs,
	type IGitHubIssueUpdateArgs,
	type IGitHubReleaseCreateArgs,
	type IGitHubReleaseDeleteArgs,
	type IGitHubReleaseUpdateArgs,
	type IGitHubRepositoryDispatchArgs,
	type IGitHubTagCreateArgs,
	type IGitHubTagDeleteArgs,
	type IGitHubWorkflowDispatchArgs,
} from '../mutations';

export interface IGitHubWriteToolOptions {
	readonly namespacePrefix: string;
	readonly context: IGitHubProviderContext;
	readonly mutationDeps: IRemoteHttpClientDeps;
	readonly nowIso?: () => string;
}

const providerSchema = z.literal('github');
const repoSelectorSchema = z
	.object({
		owner: z.string().min(1).optional(),
		repository: z.string().min(1).optional(),
		confirm: z.boolean().optional(),
		actor: z.string().min(1).optional(),
		idempotencyKey: z.string().min(1).optional(),
	})
	.strict();

const responseMetaSchema = z
	.object({
		status: z.number().int(),
		requestId: z.string().nullable(),
		durationMs: z.number().nonnegative(),
		attempts: z.number().int().positive(),
		pagination: z
			.object({
				page: z.number().int().nullable(),
				perPage: z.number().int().nullable(),
				nextPage: z.string().nullable(),
				previousPage: z.string().nullable(),
				total: z.number().int().nullable(),
				totalPages: z.number().int().nullable(),
				hasMore: z.boolean(),
			})
			.nullable(),
		rateLimit: z
			.object({
				limit: z.number().int().nullable(),
				remaining: z.number().int().nullable(),
				resetAt: z.string().nullable(),
				retryAfterSeconds: z.number().nullable(),
				scope: z.string(),
				source: z.string(),
			})
			.nullable(),
		truncated: z
			.object({
				truncated: z.boolean(),
				reason: z.string().nullable(),
				originalBytes: z.number().int().nullable(),
				keptBytes: z.number().int().nullable(),
				originalLines: z.number().int().nullable(),
				keptLines: z.number().int().nullable(),
			})
			.nullable(),
	})
	.strict();

const mutationErrorSchema = z
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
			'confirmation-required',
			'duplicate-operation',
		]),
		provider: providerSchema,
		message: z.string(),
		status: z.number().int().nullable(),
		requestId: z.string().nullable(),
		retryAfterSeconds: z.number().nullable(),
		temporary: z.boolean(),
		retryable: z.boolean(),
		nextAction: z.string().optional(),
		details: z
			.record(
				z.string(),
				z.union([z.string(), z.number(), z.boolean(), z.null()]),
			)
			.optional(),
	})
	.strict();

const auditSchema = z
	.object({
		provider: providerSchema,
		actor: z.string(),
		effect: z.string(),
		resource: z.string(),
		timestamp: z.string(),
		request: z
			.object({
				method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
				path: z.string(),
			})
			.strict(),
		remote: z
			.object({
				status: z.number().int().nullable(),
				requestId: z.string().nullable(),
				attempts: z.number().int().nonnegative(),
				duplicate: z.boolean(),
			})
			.strict(),
		idempotency: z
			.object({
				key: z.string().nullable(),
				replay: z.boolean(),
			})
			.strict(),
		details: z
			.record(
				z.string(),
				z.union([z.string(), z.number(), z.boolean(), z.null()]),
			)
			.optional(),
	})
	.strict();

const mutationEnvelopeSchema = <
	TData extends z.ZodTypeAny,
	TExisting extends z.ZodTypeAny = TData,
>(
	dataSchema: TData,
	existingSchema?: TExisting,
) => {
	const duplicateExistingSchema =
		existingSchema ?? (dataSchema as unknown as TExisting);
	return z.union([
		z
			.object({
				ok: z.literal(true),
				outcome: z.literal('applied'),
				provider: providerSchema,
				data: dataSchema,
				meta: responseMetaSchema,
				audit: auditSchema,
				idempotentReplay: z.literal(false),
			})
			.strict(),
		z
			.object({
				ok: z.literal(true),
				outcome: z.literal('duplicate'),
				provider: providerSchema,
				duplicate: z
					.object({
						message: z.string(),
						existing: duplicateExistingSchema.optional(),
					})
					.strict(),
				meta: responseMetaSchema.nullable(),
				audit: auditSchema,
				idempotentReplay: z.literal(true),
			})
			.strict(),
		z
			.object({
				ok: z.literal(false),
				outcome: z.enum(['rejected', 'failed']),
				provider: providerSchema,
				error: mutationErrorSchema,
				audit: auditSchema,
				idempotentReplay: z.literal(false),
			})
			.strict(),
	]);
};

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

const commentSchema = z
	.object({
		author: z.string(),
		body: z.string(),
		createdAt: z.string().optional(),
		url: z.string().url().optional(),
	})
	.strict();

const workflowDispatchDataSchema = z
	.object({
		workflowId: z.string(),
		ref: z.string(),
		dispatched: z.literal(true),
		inputs: z.record(z.string(), z.string()).optional(),
	})
	.strict();

const repositoryDispatchDataSchema = z
	.object({
		eventType: z.string(),
		dispatched: z.literal(true),
		clientPayloadKeys: z.array(z.string()),
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

const registerWriteTool = (
	options: IGitHubWriteToolOptions,
	id: string,
	summary: string,
	description: string,
	inputSchema: z.ZodTypeAny,
	outputSchema: z.ZodTypeAny,
	handler: (args: any) => Promise<unknown>,
	tags: string[],
): IToolRegistration => ({
	id,
	tags,
	effects: ['network', 'write'],
	summary,
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_${id}`,
			{ description, inputSchema, outputSchema },
			async (args: unknown) => toolJsonBounded(await handler(args)),
		);
	},
});

export const buildGitHubWriteToolRegistrations = (
	options: IGitHubWriteToolOptions,
): readonly IToolRegistration[] => {
	const mutations = createGitHubMutations({
		context: options.context,
		mutationDeps: options.mutationDeps,
		...(options.nowIso === undefined ? {} : { nowIso: options.nowIso }),
	});

	return [
		registerWriteTool(
			options,
			'issue_update',
			'Update an issue with explicit confirmation.',
			'Patch a GitHub issue title/body/state/labels. Requires confirm:true. Uses the shared remote mutation executor with redacted audit receipts and no automatic retries.',
			repoSelectorSchema
				.extend({
					issue: z.union([
						z.string().min(1),
						z.number().int().positive(),
					]),
					title: z.string().optional(),
					body: z.string().optional(),
					state: z.enum(['open', 'closed']).optional(),
					labels: z.array(z.string()).optional(),
				})
				.strict(),
			mutationEnvelopeSchema(
				z.object({ issue: issueSchema }).strict(),
				z.object({ issue: issueSchema }).strict(),
			),
			(args: IGitHubIssueUpdateArgs) => mutations.updateIssue(args),
			['github', 'issues', 'write'],
		),
		registerWriteTool(
			options,
			'issue_comment_create',
			'Create an issue comment with explicit confirmation.',
			'Post a GitHub issue comment. Requires confirm:true. Uses the shared remote mutation executor with redacted audit receipts and no automatic retries.',
			repoSelectorSchema
				.extend({
					issue: z.union([
						z.string().min(1),
						z.number().int().positive(),
					]),
					body: z.string().min(1),
				})
				.strict(),
			mutationEnvelopeSchema(
				z
					.object({
						issueNumber: z.string(),
						comment: commentSchema,
					})
					.strict(),
			),
			(args: IGitHubIssueCommentCreateArgs) =>
				mutations.createIssueComment(args),
			['github', 'issues', 'comments', 'write'],
		),
		registerWriteTool(
			options,
			'workflow_dispatch',
			'Dispatch a workflow with explicit confirmation.',
			'Dispatch a GitHub Actions workflow on a ref. Requires confirm:true. Uses the shared remote mutation executor with redacted audit receipts and no automatic retries.',
			repoSelectorSchema
				.extend({
					workflowId: z.union([
						z.string().min(1),
						z.number().int().positive(),
					]),
					ref: z.string().min(1),
					inputs: z.record(z.string(), z.string()).optional(),
				})
				.strict(),
			mutationEnvelopeSchema(workflowDispatchDataSchema),
			(args: IGitHubWorkflowDispatchArgs) =>
				mutations.dispatchWorkflow(args),
			['github', 'workflows', 'write'],
		),
		registerWriteTool(
			options,
			'repository_dispatch',
			'Dispatch a repository event with explicit confirmation.',
			'Create a GitHub repository_dispatch event. Requires confirm:true. Uses the shared remote mutation executor with redacted audit receipts and no automatic retries.',
			repoSelectorSchema
				.extend({
					eventType: z.string().min(1),
					clientPayload: z.record(z.string(), z.unknown()).optional(),
				})
				.strict(),
			mutationEnvelopeSchema(repositoryDispatchDataSchema),
			(args: IGitHubRepositoryDispatchArgs) =>
				mutations.dispatchRepository(args),
			['github', 'workflows', 'dispatch', 'write'],
		),
		registerWriteTool(
			options,
			'release_create',
			'Create a release with explicit confirmation.',
			'Create a GitHub release. Requires confirm:true. Duplicate remote releases are normalized without auto-retrying.',
			repoSelectorSchema
				.extend({
					tagName: z.string().min(1),
					targetCommitish: z.string().min(1).optional(),
					name: z.string().optional(),
					body: z.string().optional(),
					draft: z.boolean().optional(),
					prerelease: z.boolean().optional(),
					generateReleaseNotes: z.boolean().optional(),
				})
				.strict(),
			mutationEnvelopeSchema(
				z.object({ release: releaseSchema }).strict(),
			),
			(args: IGitHubReleaseCreateArgs) => mutations.createRelease(args),
			['github', 'releases', 'write'],
		),
		registerWriteTool(
			options,
			'release_update',
			'Update a release with explicit confirmation.',
			'Patch a GitHub release. Requires confirm:true. Uses the shared remote mutation executor with redacted audit receipts and no automatic retries.',
			repoSelectorSchema
				.extend({
					releaseId: z.union([
						z.string().min(1),
						z.number().int().positive(),
					]),
					tagName: z.string().min(1).optional(),
					targetCommitish: z.string().min(1).optional(),
					name: z.string().optional(),
					body: z.string().optional(),
					draft: z.boolean().optional(),
					prerelease: z.boolean().optional(),
					generateReleaseNotes: z.boolean().optional(),
				})
				.strict(),
			mutationEnvelopeSchema(
				z.object({ release: releaseSchema }).strict(),
			),
			(args: IGitHubReleaseUpdateArgs) => mutations.updateRelease(args),
			['github', 'releases', 'write'],
		),
		registerWriteTool(
			options,
			'release_delete',
			'Delete a release with explicit confirmation.',
			'Delete a GitHub release. Requires confirm:true. Uses the shared remote mutation executor with redacted audit receipts and no automatic retries.',
			repoSelectorSchema
				.extend({
					releaseId: z.union([
						z.string().min(1),
						z.number().int().positive(),
					]),
				})
				.strict(),
			mutationEnvelopeSchema(
				z
					.object({ releaseId: z.string(), deleted: z.literal(true) })
					.strict(),
			),
			(args: IGitHubReleaseDeleteArgs) => mutations.deleteRelease(args),
			['github', 'releases', 'write'],
		),
		registerWriteTool(
			options,
			'tag_create',
			'Create a tag ref with explicit confirmation.',
			'Create a GitHub tag ref. Requires confirm:true. Duplicate remote tags are normalized without auto-retrying.',
			repoSelectorSchema
				.extend({
					tagName: z.string().min(1),
					sha: z.string().min(1),
				})
				.strict(),
			mutationEnvelopeSchema(z.object({ tag: tagSchema }).strict()),
			(args: IGitHubTagCreateArgs) => mutations.createTag(args),
			['github', 'tags', 'write'],
		),
		registerWriteTool(
			options,
			'tag_delete',
			'Delete a tag ref with explicit confirmation.',
			'Delete a GitHub tag ref. Requires confirm:true. Uses the shared remote mutation executor with redacted audit receipts and no automatic retries.',
			repoSelectorSchema
				.extend({
					tagName: z.string().min(1),
				})
				.strict(),
			mutationEnvelopeSchema(
				z
					.object({
						tag: z
							.object({
								name: z.string(),
								deleted: z.literal(true),
							})
							.strict(),
					})
					.strict(),
			),
			(args: IGitHubTagDeleteArgs) => mutations.deleteTag(args),
			['github', 'tags', 'write'],
		),
	];
};
