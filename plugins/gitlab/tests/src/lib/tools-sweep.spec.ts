/**
 * tools-sweep.spec.ts — every gitlab tool and every action it declares,
 * against a client that answers by the shape of the path: each answer is
 * normalised into the declared output, and a project the caller names is
 * the one asked for.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IRemoteResponseMeta } from '@delendai/contracts/remote-provider';
import { createFakeToolServer, fakePartial } from '@delendai/test-kit';
import { afterEach, describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';

import type { IGitLabProviderContext } from '../../../src/lib/config';
import type {
	createGitLabHttpClient,
	IGitLabHttpRequestOptions,
} from '../../../src/lib/client';
import { buildGitLabToolRegistrations } from '../../../src/lib/tools/shared';

type ITool = {
	readonly handler: (args: unknown) => Promise<unknown>;
	readonly meta: {
		readonly inputSchema?: ZodType<unknown>;
		readonly outputSchema?: ZodType<unknown>;
	};
};

const META: IRemoteResponseMeta = {
	status: 200,
	requestId: 'req-1',
	durationMs: 1,
	attempts: 1,
	pagination: {
		page: 1,
		perPage: 20,
		nextPage: '2',
		previousPage: null,
		total: 2,
		totalPages: 1,
		hasMore: true,
	},
	rateLimit: null,
	truncated: null,
};

/** One record carrying every field a gitlab answer may hold. */
const RECORD = {
	id: 7,
	iid: 3,
	project_id: 5,
	name: 'name',
	title: 'title',
	description: 'body',
	body: 'note',
	state: 'opened',
	status: 'success',
	ref: 'main',
	sha: 'abc123',
	short_id: 'abc',
	message: 'feat: x',
	tag_name: 'v1.0.0',
	path_with_namespace: 'group/repo',
	default_branch: 'main',
	web_url: 'https://gitlab.example/group/repo',
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-02T00:00:00Z',
	author: { username: 'ana', name: 'Ana' },
	author_name: 'Ana',
	labels: ['bug'],
	key: 'DEPLOY_ENV',
	value: 'super-secret',
	environment_scope: '*',
	masked: true,
	protected: true,
	variable_type: 'env_var',
	environment: { name: 'production' },
	stage: 'test',
	pipeline: { id: 9 },
	notes: [{ id: 1, body: 'n', author: { username: 'ana' } }],
	commit: { id: 'abc123', message: 'feat: x' },
	artifacts: [{ file_type: 'archive', filename: 'a.zip', size: 4 }],
	commits: [{ id: 'abc123', title: 'feat: x' }],
	diffs: [{ old_path: 'a', new_path: 'a', diff: '+x' }],
};

const answer = (path: string, parseAs: unknown): unknown => {
	if (parseAs === 'text') return 'line one\nline two\n';
	if (parseAs === 'binary') return new TextEncoder().encode('zip').buffer;
	if (/\/compare\b/u.test(path)) return RECORD;
	// A path that ends in an id or a name is one record; else a list.
	return /\/(?:\d+|[a-z0-9._-]+%2F[a-z0-9._-]+|v\d[\w.-]*)$/u.test(path) &&
		!/\/(?:projects|issues|merge_requests|commits|pipelines|jobs|releases|deployments|tags|notes|discussions|variables|artifacts)$/u.test(
			path,
		)
		? RECORD
		: [RECORD, { ...RECORD, id: 8, iid: 4 }];
};

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0))
		await rm(dir, { recursive: true, force: true });
});

const harness = async () => {
	const pluginTempDir = await mkdtemp(join(tmpdir(), 'gitlab-sweep-'));
	dirs.push(pluginTempDir);
	const paths: string[] = [];
	const client = fakePartial<ReturnType<typeof createGitLabHttpClient>>({
		request: async <T>(request: IGitLabHttpRequestOptions<T>) => {
			paths.push(request.path);
			return {
				ok: true as const,
				provider: 'gitlab' as const,
				data: answer(request.path, request.parseAs) as T,
				meta: META,
			};
		},
	});
	const tools: Record<string, ITool> = {};
	const regs = buildGitLabToolRegistrations({
		namespacePrefix: 'gitlab',
		context: fakePartial<IGitLabProviderContext>({
			provider: 'gitlab',
			token: 'test-token',
			apiBaseUrl: 'https://gitlab.example/api/v4',
			webBaseUrl: 'https://gitlab.example',
			host: 'gitlab.example',
			project: {
				provider: 'gitlab',
				host: 'gitlab.example',
				projectPath: 'group/repo',
				displayName: 'group/repo',
				webUrl: 'https://gitlab.example/group/repo',
				apiUrl: 'https://gitlab.example/api/v4/projects/group%2Frepo',
			},
			timeoutMs: 15_000,
			maxRetries: 0,
			retryBaseDelayMs: 250,
			sources: {
				token: 'env:GITLAB_TOKEN',
				apiBaseUrl: 'default',
				webBaseUrl: 'default',
				project: ['plugin'],
			},
		}),
		client,
		pluginTempDir,
	});
	const server = createFakeToolServer({
		onRegisterTool: ({ name, config, handler }) => {
			tools[name] = {
				handler: async (args) => handler(args),
				meta: config as ITool['meta'],
			};
		},
	});
	for (const reg of regs) await reg.register(server);
	return { tools, paths };
};

const parse = (result: unknown): Record<string, unknown> =>
	JSON.parse(
		(result as { content?: Array<{ text?: string }> }).content?.[0]?.text ??
			'{}',
	) as Record<string, unknown>;

/** Every argument any action reads, so each action has what it needs. */
const ARGS = {
	id: 7,
	iid: 3,
	sha: 'abc123',
	refName: 'main',
	ref: 'main',
	query: 'needle',
	state: 'opened',
	status: 'success',
	pipelineId: 9,
	jobId: 7,
	tagName: 'v1.0.0',
	environment: 'production',
	environmentScope: '*',
	page: 2,
	perPage: 10,
	from: 'v1.0.0',
	to: 'main',
	maxBytes: 4,
	maxLines: 1,
};

const ACTIONS: Readonly<Record<string, readonly (string | undefined)[]>> = {
	gitlab_context: [undefined],
	gitlab_projects: ['get', 'list', 'search', 'variables'],
	gitlab_issues: ['get', 'list', 'search', 'comments', 'discussions'],
	gitlab_merge_requests: ['get', 'list', 'search', 'comments', 'discussions'],
	gitlab_commits: ['get', 'list', 'search'],
	gitlab_refs: [undefined],
	gitlab_pipelines: ['get', 'list'],
	gitlab_jobs: ['get', 'list', 'log'],
	gitlab_artifacts: ['list', 'download'],
	gitlab_releases: ['list', 'get', 'tags'],
	gitlab_deployments: ['get', 'list'],
};

const ISSUES_TOOL = 'gitlab_issues';

describe('every gitlab tool and action', () => {
	for (const [name, actions] of Object.entries(ACTIONS)) {
		for (const action of actions) {
			it(`${name}${action === undefined ? '' : ` ${action}`} answers in its declared shape`, async () => {
				const { tools } = await harness();
				const tool = tools[name];
				expect(tool, `${name} is registered`).toBeDefined();
				const args: Record<string, unknown> = {};
				const shape =
					(
						tool?.meta.inputSchema as {
							shape?: Record<string, unknown>;
						}
					)?.shape ?? {};
				for (const [key, value] of Object.entries(ARGS)) {
					if (key in shape) args[key] = value;
				}
				const output = parse(
					await tool?.handler(
						action === undefined ? args : { ...args, action },
					),
				);
				expect(tool?.meta.outputSchema?.safeParse(output).success).toBe(
					true,
				);
			});
		}
	}

	it('asks for the project the caller names, not the configured one', async () => {
		const { tools, paths } = await harness();
		await tools[ISSUES_TOOL]?.handler({
			action: 'list',
			projectPath: 'other/place',
		});
		await tools[ISSUES_TOOL]?.handler({
			action: 'list',
			projectId: 42,
		});
		expect(paths).toEqual([
			'/projects/other%2Fplace/issues',
			'/projects/42/issues',
		]);
	});
});
