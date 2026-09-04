// f00415 follow-up: diagnostics.spec.ts in this directory tests
// buildGitLabToolRegistrations and never once calls diagnoseGitLabPipeline,
// the actual exported entrypoint of ../src/lib/diagnostics.ts (570 lines,
// 0% branch coverage at the time this file was written). This file drives
// diagnoseGitLabPipeline and its other exports directly through a fake
// GitLab HTTP client (no real network) so the GitLab-specific adapter
// logic — how pipeline/job/log responses are parsed, correlated, ranked
// and truncated before being handed to the shared diagnoseRemoteExecution
// engine — is actually exercised, branch by branch.

import { describe, expect, it } from 'vitest';

import type {
	IRemoteProjectCoordinates,
	IRemoteProviderError,
	IRemoteProviderSuccess,
	IRemoteResponseMeta,
} from '@delendai/contracts/remote-provider';

import { createGitLabHttpClient, GitLabRequestError } from '../src/lib/client';
import {
	diagnoseGitLabPipeline,
	type IGitLabPipelineDiagnosticInput,
} from '../src/lib/diagnostics';
import type { IGitLabProviderContext } from '../src/lib/config';

type GitLabClient = ReturnType<typeof createGitLabHttpClient>;

interface IFakeRequest {
	readonly path: string;
	readonly query?: Readonly<Record<string, unknown>>;
	readonly parseAs?: 'json' | 'text' | 'binary';
}

type FakeOutcome =
	| { readonly kind: 'data'; readonly value: unknown }
	| { readonly kind: 'throw'; readonly error: unknown };

interface IFakeRoute {
	readonly match: (path: string) => boolean;
	readonly respond: (request: IFakeRequest) => FakeOutcome;
}

const baseMeta = (): IRemoteResponseMeta => ({
	status: 200,
	requestId: 'req-fake',
	durationMs: 1,
	attempts: 1,
	pagination: null,
	rateLimit: null,
	truncated: null,
});

const okResult = (data: unknown): FakeOutcome => ({
	kind: 'data',
	value: data,
});
const failResult = (error: unknown): FakeOutcome => ({ kind: 'throw', error });

/**
 * Builds a fake GitLabClient that never touches the network. Requests are
 * dispatched to the first matching route (checked in order); an unmatched
 * request throws immediately so a mis-targeted test fails loudly instead of
 * hanging or silently returning undefined data.
 */
const createFakeClient = (routes: readonly IFakeRoute[]): GitLabClient => {
	const request = async <TResponse>(
		req: IFakeRequest,
	): Promise<IRemoteProviderSuccess<TResponse>> => {
		const route = routes.find((candidate) => candidate.match(req.path));
		if (route === undefined) {
			throw new Error(`no fake route matched path: ${req.path}`);
		}
		const outcome = route.respond(req);
		if (outcome.kind === 'throw') throw outcome.error;
		return {
			ok: true,
			provider: 'gitlab',
			data: outcome.value as TResponse,
			meta: baseMeta(),
		};
	};
	return { request } as unknown as GitLabClient;
};

const notFoundError = (): IRemoteProviderError => ({
	code: 'not-found',
	provider: 'gitlab',
	message: 'gitlab resource was not found',
	status: 404,
	requestId: 'req-404',
	retryAfterSeconds: null,
	temporary: false,
	retryable: false,
});

const transientError = (): IRemoteProviderError => ({
	code: 'transient',
	provider: 'gitlab',
	message: 'gitlab request failed with a transient 502',
	status: 502,
	requestId: 'req-502',
	retryAfterSeconds: null,
	temporary: true,
	retryable: true,
});

const buildContext = (
	overrides: Partial<IGitLabProviderContext> = {},
): IGitLabProviderContext => ({
	provider: 'gitlab',
	token: 'glpat-fake-token',
	apiBaseUrl: 'https://gitlab.example.com/api/v4',
	webBaseUrl: 'https://gitlab.example.com',
	host: 'gitlab.example.com',
	project: null,
	timeoutMs: 15_000,
	maxRetries: 0,
	retryBaseDelayMs: 0,
	sources: {
		token: 'env:GITLAB_TOKEN',
		apiBaseUrl: 'default',
		webBaseUrl: 'default',
		project: [],
	},
	...overrides,
});

const projectCoordinates = (
	overrides: Partial<IRemoteProjectCoordinates> = {},
): IRemoteProjectCoordinates => ({
	provider: 'gitlab',
	host: 'gitlab.example.com',
	projectPath: 'cartago/delendai',
	displayName: 'cartago/delendai',
	webUrl: 'https://gitlab.example.com/cartago/delendai',
	apiUrl: 'https://gitlab.example.com/api/v4/projects/cartago%2Fdelendai',
	...overrides,
});

describe('diagnoseGitLabPipeline - project resolution', () => {
	it('throws when neither input nor context supplies project coordinates', async () => {
		const context = buildContext({ project: null });
		const client = createFakeClient([]);
		await expect(
			diagnoseGitLabPipeline({ context, client }, {}),
		).rejects.toThrow(/require projectId or projectPath/);
	});

	it('inherits displayName/webUrl/apiUrl from context.project when input repeats the same coordinates', async () => {
		const context = buildContext({
			project: projectCoordinates({
				displayName: 'Custom Display Name',
				webUrl: 'https://gitlab.example.com/custom-web',
				apiUrl: 'https://gitlab.example.com/api/v4/custom-api',
			}),
		});
		const client = createFakeClient([
			{
				match: (path) => path.includes('/pipelines'),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai' },
		);
		expect(result.resource.value?.project.displayName).toBe(
			'Custom Display Name',
		);
		expect(result.resource.value?.project.webUrl).toBe(
			'https://gitlab.example.com/custom-web',
		);
		expect(result.resource.value?.project.apiUrl).toBe(
			'https://gitlab.example.com/api/v4/custom-api',
		);
	});

	it('computes a fresh webUrl/apiUrl from projectPath when input overrides context.project', async () => {
		const context = buildContext({
			project: projectCoordinates({ projectPath: 'other/repo' }),
		});
		const client = createFakeClient([
			{
				match: (path) => path.includes('/pipelines'),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai' },
		);
		expect(result.resource.value?.project.webUrl).toBe(
			'https://gitlab.example.com/cartago/delendai',
		);
		expect(result.resource.value?.project.apiUrl).toBe(
			`https://gitlab.example.com/api/v4/projects/${encodeURIComponent('cartago/delendai')}`,
		);
		expect(result.resource.value?.project.displayName).toBe(
			'cartago/delendai',
		);
	});

	it('falls back to the bare webUrl and String(projectId) apiUrl/displayName when only projectId is given', async () => {
		const context = buildContext({ project: null });
		const client = createFakeClient([
			{
				match: (path) => path.includes('/pipelines'),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectId: 42 },
		);
		expect(result.resource.value?.project.webUrl).toBe(
			'https://gitlab.example.com',
		);
		expect(result.resource.value?.project.apiUrl).toBe(
			'https://gitlab.example.com/api/v4/projects/42',
		);
		expect(result.resource.value?.project.displayName).toBe('42');
	});

	it('propagates a self-managed host into the resolved project coordinates', async () => {
		const context = buildContext({
			host: 'gitlab.selfhosted.internal',
			apiBaseUrl: 'https://gitlab.selfhosted.internal/api/v4',
			webBaseUrl: 'https://gitlab.selfhosted.internal',
		});
		const client = createFakeClient([
			{
				match: (path) => path.includes('/pipelines'),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai' },
		);
		expect(result.resource.value?.project.host).toBe(
			'gitlab.selfhosted.internal',
		);
	});

	it('propagates the gitlab.com host into the resolved project coordinates', async () => {
		const context = buildContext({
			host: 'gitlab.com',
			apiBaseUrl: 'https://gitlab.com/api/v4',
			webBaseUrl: 'https://gitlab.com',
		});
		const client = createFakeClient([
			{
				match: (path) => path.includes('/pipelines'),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai' },
		);
		expect(result.resource.value?.project.host).toBe('gitlab.com');
	});
});

describe('diagnoseGitLabPipeline - pipeline resolution by id', () => {
	const context = buildContext({
		project: projectCoordinates(),
	});

	it('rejects when the pipeline itself cannot be resolved (not attempt-wrapped)', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/999$/.test(path),
				respond: () =>
					failResult(new GitLabRequestError(notFoundError())),
			},
		]);
		await expect(
			diagnoseGitLabPipeline(
				{ context, client },
				{ projectPath: 'cartago/delendai', pipelineId: 999 },
			),
		).rejects.toThrow();
	});

	it('marks the run partial and returns an empty job list when the jobs endpoint fails', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/1$/.test(path),
				respond: () =>
					okResult({
						id: 1,
						status: 'failed',
						sha: 'abc123',
						ref: 'main',
						created_at: '2026-08-31T10:00:00.000Z',
						updated_at: '2026-08-31T10:05:00.000Z',
						web_url: 'https://gitlab.example.com/p/-/pipelines/1',
					}),
			},
			{
				match: (path) => /\/pipelines\/1\/jobs$/.test(path),
				respond: () =>
					failResult(new GitLabRequestError(transientError())),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 1 },
		);
		expect(result.run.value?.jobs).toEqual([]);
		expect(result.run.availability).toBe('partial');
		expect(result.run.notes).toContain(
			'selected run came from partial provider data',
		);
	});

	it('returns an empty job list without partial marking when the jobs endpoint succeeds empty', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/2$/.test(path),
				respond: () =>
					okResult({
						id: 2,
						status: 'success',
						sha: 'def456',
						ref: 'main',
					}),
			},
			{
				match: (path) => /\/pipelines\/2\/jobs$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 2 },
		);
		expect(result.run.value?.jobs).toEqual([]);
		expect(result.run.notes).not.toContain(
			'selected run came from partial provider data',
		);
	});

	it('fetches logs only for relevant jobs (RELEVANT_JOB_STATUSES) and skips a plain success job', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/3$/.test(path),
				respond: () =>
					okResult({
						id: 3,
						status: 'failed',
						sha: 'sha3',
						ref: 'main',
					}),
			},
			{
				match: (path) => /\/pipelines\/3\/jobs$/.test(path),
				respond: () =>
					okResult([
						{
							id: 'job-failed',
							name: 'test',
							status: 'failed',
							web_url:
								'https://gitlab.example.com/jobs/job-failed',
						},
						{
							id: 'job-success',
							name: 'build',
							status: 'success',
						},
					]),
			},
			{
				match: (path) => /\/jobs\/job-failed\/trace$/.test(path),
				respond: () => okResult('boom trace text'),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 3 },
		);
		const jobs = result.run.value?.jobs ?? [];
		const failedJob = jobs.find((job) => job.id === 'job-failed');
		const successJob = jobs.find((job) => job.id === 'job-success');
		expect(failedJob?.log?.text).toBe('boom trace text');
		expect(successJob?.log).toBeNull();
	});

	it('includes a success job as relevant when it carries artifacts', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/4$/.test(path),
				respond: () =>
					okResult({
						id: 4,
						status: 'success',
						sha: 'sha4',
						ref: 'main',
					}),
			},
			{
				match: (path) => /\/pipelines\/4\/jobs$/.test(path),
				respond: () =>
					okResult([
						{
							id: 'job-with-artifact',
							name: 'package',
							status: 'success',
							artifacts: [
								{ file_type: 'archive', filename: 'dist.zip' },
							],
						},
					]),
			},
			{
				match: (path) => /\/jobs\/job-with-artifact\/trace$/.test(path),
				respond: () => okResult('artifact job log'),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 4 },
		);
		const jobs = result.run.value?.jobs ?? [];
		expect(jobs[0]?.log?.text).toBe('artifact job log');
		expect(jobs[0]?.artifacts?.[0]?.name).toBe('dist.zip');
		expect(jobs[0]?.artifacts?.[0]?.kind).toBe('archive');
	});

	it('sorts relevant jobs by most-recent timestamp and truncates to limits.maxRelevantJobs', async () => {
		const fetchedTraceIds: string[] = [];
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/5$/.test(path),
				respond: () =>
					okResult({
						id: 5,
						status: 'failed',
						sha: 'sha5',
						ref: 'main',
					}),
			},
			{
				match: (path) => /\/pipelines\/5\/jobs$/.test(path),
				respond: () =>
					okResult([
						{
							id: 'older',
							name: 'a',
							status: 'failed',
							finished_at: '2026-08-31T09:00:00.000Z',
						},
						{
							id: 'newer',
							name: 'b',
							status: 'failed',
							finished_at: '2026-08-31T11:00:00.000Z',
						},
						{
							id: 'newest',
							name: 'c',
							status: 'failed',
							finished_at: '2026-08-31T12:00:00.000Z',
						},
					]),
			},
			{
				match: (path) => /\/jobs\/.+\/trace$/.test(path),
				respond: (req) => {
					const match = /\/jobs\/(.+)\/trace$/.exec(req.path);
					fetchedTraceIds.push(match?.[1] ?? 'unknown');
					return okResult('log');
				},
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{
				projectPath: 'cartago/delendai',
				pipelineId: 5,
				limits: { maxRelevantJobs: 2 },
			},
		);
		expect(fetchedTraceIds.sort()).toEqual(['newer', 'newest']);
		expect(fetchedTraceIds).not.toContain('older');
		expect(result.run.value?.jobs).toHaveLength(3);
	});

	it('falls back to createdAt/startedAt (and 0) when comparing jobs with missing finishedAt', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/6$/.test(path),
				respond: () =>
					okResult({
						id: 6,
						status: 'failed',
						sha: 'sha6',
						ref: 'main',
					}),
			},
			{
				match: (path) => /\/pipelines\/6\/jobs$/.test(path),
				respond: () =>
					okResult([
						{
							id: 'no-timestamps',
							name: 'a',
							status: 'queued',
						},
						{
							id: 'has-started',
							name: 'b',
							status: 'running',
							started_at: '2026-08-31T09:30:00.000Z',
						},
						{
							id: 'has-created',
							name: 'c',
							status: 'canceled',
							created_at: '2026-08-31T09:00:00.000Z',
						},
					]),
			},
			{
				match: (path) => /\/jobs\/.+\/trace$/.test(path),
				respond: () => okResult('log'),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{
				projectPath: 'cartago/delendai',
				pipelineId: 6,
				limits: { maxRelevantJobs: 10 },
			},
		);
		// All three fetched successfully: comparator did not throw and every
		// relevant job (queued/running/canceled) got a log attached.
		const jobs = result.run.value?.jobs ?? [];
		for (const id of ['no-timestamps', 'has-started', 'has-created']) {
			expect(jobs.find((job) => job.id === id)?.log?.text).toBe('log');
		}
	});

	it('records a job trace failure as a candidate error and marks the run partial', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/7$/.test(path),
				respond: () =>
					okResult({
						id: 7,
						status: 'failed',
						sha: 'sha7',
						ref: 'main',
					}),
			},
			{
				match: (path) => /\/pipelines\/7\/jobs$/.test(path),
				respond: () =>
					okResult([
						{
							id: 'trace-fails',
							name: 'a',
							status: 'failed',
						},
					]),
			},
			{
				match: (path) => /\/jobs\/trace-fails\/trace$/.test(path),
				respond: () =>
					failResult(new GitLabRequestError(transientError())),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 7 },
		);
		expect(result.run.availability).toBe('partial');
		const jobs = result.run.value?.jobs ?? [];
		const failed = jobs.find((job) => job.id === 'trace-fails');
		expect(failed?.log?.availability).toBe('unavailable');
		expect(failed?.log?.errors[0]?.code).toBe('transient');
	});

	it.each([
		['created', 'queued'],
		['pending', 'queued'],
		['preparing', 'queued'],
		['waiting_for_resource', 'queued'],
		['manual', 'queued'],
		['scheduled', 'queued'],
		['running', 'running'],
		['success', 'success'],
		['failed', 'failed'],
		['canceled', 'canceled'],
		['cancelled', 'canceled'],
		['skipped', 'skipped'],
		['timedout', 'timed-out'],
		['timed_out', 'timed-out'],
		['some-unknown-gitlab-status', 'unknown'],
	])(
		'maps GitLab job status %s to normalized status %s',
		async (gitlabStatus, expectedStatus) => {
			const client = createFakeClient([
				{
					match: (path) => /\/pipelines\/8$/.test(path),
					respond: () =>
						okResult({
							id: 8,
							status: 'failed',
							sha: 'sha8',
							ref: 'main',
						}),
				},
				{
					match: (path) => /\/pipelines\/8\/jobs$/.test(path),
					respond: () =>
						okResult([
							{
								id: 'status-job',
								name: 'a',
								status: gitlabStatus,
								artifacts: [{ file_type: 'archive' }],
							},
						]),
				},
				{
					match: (path) => /\/jobs\/status-job\/trace$/.test(path),
					respond: () => okResult('log'),
				},
			]);
			const result = await diagnoseGitLabPipeline(
				{ context, client },
				{ projectPath: 'cartago/delendai', pipelineId: 8 },
			);
			const jobs = result.run.value?.jobs ?? [];
			expect(jobs[0]?.status).toBe(expectedStatus);
		},
	);

	it.each([
		['trace', 'trace'],
		['junit', 'report'],
		['metadata', 'report'],
		['archive', 'archive'],
		[undefined, 'archive'],
	])(
		'maps GitLab artifact file_type %s to artifact kind %s',
		async (fileType, expectedKind) => {
			const client = createFakeClient([
				{
					match: (path) => /\/pipelines\/9$/.test(path),
					respond: () =>
						okResult({
							id: 9,
							status: 'failed',
							sha: 'sha9',
							ref: 'main',
						}),
				},
				{
					match: (path) => /\/pipelines\/9\/jobs$/.test(path),
					respond: () =>
						okResult([
							{
								id: 'artifact-job',
								name: 'a',
								status: 'success',
								artifacts: [
									fileType === undefined
										? { size: 10 }
										: { file_type: fileType, size: 10 },
								],
							},
						]),
				},
				{
					match: (path) => /\/jobs\/artifact-job\/trace$/.test(path),
					respond: () => okResult('log'),
				},
			]);
			const result = await diagnoseGitLabPipeline(
				{ context, client },
				{ projectPath: 'cartago/delendai', pipelineId: 9 },
			);
			const jobs = result.run.value?.jobs ?? [];
			expect(jobs[0]?.artifacts?.[0]?.kind).toBe(expectedKind);
			expect(jobs[0]?.artifacts?.[0]?.sizeBytes).toBe(10);
		},
	);
});

describe('diagnoseGitLabPipeline - latest-pipeline resolution (no pipelineId)', () => {
	const context = buildContext({ project: projectCoordinates() });

	it('selects the first pipeline from the list as a summary run with no jobs field', async () => {
		let capturedQuery: Readonly<Record<string, unknown>> | undefined;
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: (req) => {
					capturedQuery = req.query;
					return okResult([
						{
							id: 10,
							status: 'success',
							sha: 'latest-sha',
							ref: 'main',
						},
						{
							id: 9,
							status: 'failed',
							sha: 'older-sha',
							ref: 'main',
						},
					]);
				},
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', ref: 'main', status: 'success' },
		);
		expect(result.run.value?.id).toBe(10);
		expect(result.run.value?.jobs).toEqual([]);
		expect(capturedQuery?.ref).toBe('main');
		expect(capturedQuery?.status).toBe('success');
	});

	it('omits ref/status query params when not provided', async () => {
		let capturedQuery: Readonly<Record<string, unknown>> | undefined;
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: (req) => {
					capturedQuery = req.query;
					return okResult([{ id: 1, status: 'success', sha: 'x' }]);
				},
			},
		]);
		await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai' },
		);
		expect(capturedQuery?.ref).toBeUndefined();
		expect(capturedQuery?.status).toBeUndefined();
	});

	it('returns a null run (no runs passed downstream) when the pipeline list is empty', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai' },
		);
		expect(result.run.value).toBeNull();
		expect(result.run.availability).toBe('partial');
	});
});

describe('diagnoseGitLabPipeline - merge request / review resolution', () => {
	const context = buildContext({ project: projectCoordinates() });

	it('leaves review undefined when mergeRequestIid is not provided', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai' },
		);
		expect(result.review.value).toBeNull();
	});

	it('leaves review undefined (without crashing) when the merge request lookup fails', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/merge_requests\/7$/.test(path),
				respond: () =>
					failResult(new GitLabRequestError(notFoundError())),
			},
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', mergeRequestIid: 7 },
		);
		expect(result.review.value).toBeNull();
	});

	it.each([
		[{ merged_at: '2026-08-01T00:00:00.000Z', state: 'merged' }, 'merged'],
		[{ state: 'opened' }, 'open'],
		[{ state: 'closed' }, 'closed'],
		[{ state: 'other', draft: true }, 'draft'],
		[{ state: 'other', work_in_progress: true }, 'draft'],
		[{ state: 'something-else' }, 'unknown'],
	])(
		'maps merge request shape %j to review state %s',
		async (fields, expectedState) => {
			const client = createFakeClient([
				{
					match: (path) => /\/merge_requests\/11$/.test(path),
					respond: () =>
						okResult({
							id: 55,
							iid: 11,
							source_branch: 'feature/x',
							target_branch: 'main',
							title: 'A change',
							web_url: 'https://gitlab.example.com/mr/11',
							...fields,
						}),
				},
				{
					match: (path) => /\/pipelines$/.test(path),
					respond: () => okResult([]),
				},
			]);
			const result = await diagnoseGitLabPipeline(
				{ context, client },
				{ projectPath: 'cartago/delendai', mergeRequestIid: 11 },
			);
			expect(result.review.value?.state).toBe(expectedState);
			expect(result.review.value?.sourceRef?.name).toBe('feature/x');
			expect(result.review.value?.targetRef?.name).toBe('main');
		},
	);
});

describe('diagnoseGitLabPipeline - commit resolution priority and shape', () => {
	const context = buildContext({ project: projectCoordinates() });

	it('prefers an explicit input.sha over review/run shas', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/repository\/commits\//.test(path),
				respond: (req) => {
					expect(req.path).toContain('explicit-sha');
					return okResult({ id: 'explicit-sha', title: 'x' });
				},
			},
			{
				match: (path) => /\/pipelines\/20$/.test(path),
				respond: () =>
					okResult({ id: 20, status: 'success', sha: 'run-sha' }),
			},
			{
				match: (path) => /\/pipelines\/20\/jobs$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{
				projectPath: 'cartago/delendai',
				pipelineId: 20,
				sha: 'explicit-sha',
			},
		);
		expect(result.commit.value?.sha).toBe('explicit-sha');
	});

	it('falls back to the selected run sha when neither input.sha nor a review is present', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/repository\/commits\//.test(path),
				respond: (req) => {
					expect(req.path).toContain('run-sha');
					return okResult({ id: 'run-sha' });
				},
			},
			{
				match: (path) => /\/pipelines\/21$/.test(path),
				respond: () =>
					okResult({ id: 21, status: 'success', sha: 'run-sha' }),
			},
			{
				match: (path) => /\/pipelines\/21\/jobs$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 21 },
		);
		expect(result.commit.value?.sha).toBe('run-sha');
	});

	it('leaves commit undefined when no sha can be resolved from any source', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai' },
		);
		expect(result.commit.value).toBeNull();
	});

	it('falls back to a bare {sha} commit stub when the commit lookup fails', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/repository\/commits\//.test(path),
				respond: () =>
					failResult(new GitLabRequestError(notFoundError())),
			},
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', sha: 'stub-sha' },
		);
		expect(result.commit.value?.sha).toBe('stub-sha');
		expect(result.commit.value?.title).toBeUndefined();
	});

	it('maps commit fields and falls back from authored_date to created_at', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/repository\/commits\//.test(path),
				respond: () =>
					okResult({
						id: 'full-sha',
						title: 'Fix bug',
						message: 'Fix bug\n\nDetails',
						author_name: 'Cartago',
						created_at: '2026-08-30T00:00:00.000Z',
						web_url: 'https://gitlab.example.com/commit/full-sha',
					}),
			},
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', sha: 'full-sha' },
		);
		expect(result.commit.value?.authoredAt).toBe(
			'2026-08-30T00:00:00.000Z',
		);
		expect(result.commit.value?.authorName).toBe('Cartago');
		expect(result.commit.value?.url).toBe(
			'https://gitlab.example.com/commit/full-sha',
		);
	});
});

describe('diagnoseGitLabPipeline - ref resolution', () => {
	const context = buildContext({ project: projectCoordinates() });

	it('builds ref from input.ref when provided, using the resolved sha', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{
				projectPath: 'cartago/delendai',
				ref: 'feature/branch',
				sha: 'ref-sha',
			},
		);
		expect(result.ref.value?.name).toBe('feature/branch');
		expect(result.ref.value?.fullName).toBe('refs/heads/feature/branch');
		expect(result.ref.value?.sha).toBe('ref-sha');
	});

	it('keeps a fully-qualified refs/ name as-is for fullName', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', ref: 'refs/heads/main' },
		);
		expect(result.ref.value?.fullName).toBe('refs/heads/main');
	});

	it('falls back to the review sourceRef when input.ref is absent', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/merge_requests\/30$/.test(path),
				respond: () =>
					okResult({
						id: 1,
						iid: 30,
						source_branch: 'from-review',
						target_branch: 'main',
					}),
			},
			{
				match: (path) => /\/pipelines$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', mergeRequestIid: 30 },
		);
		expect(result.ref.value?.name).toBe('from-review');
	});

	it('falls back to the selected run ref when input.ref and review are both absent', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/40$/.test(path),
				respond: () =>
					okResult({
						id: 40,
						status: 'failed',
						sha: 'run-ref-sha',
						ref: 'from-run',
					}),
			},
			{
				match: (path) => /\/pipelines\/40\/jobs$/.test(path),
				respond: () => okResult([]),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 40 },
		);
		expect(result.ref.value?.name).toBe('from-run');
	});
});

describe('diagnoseGitLabPipeline - provider error classification', () => {
	const context = buildContext({ project: projectCoordinates() });

	it('uses the wrapped remoteError from a thrown GitLabRequestError', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/50$/.test(path),
				respond: () =>
					okResult({ id: 50, status: 'failed', sha: 'sha50' }),
			},
			{
				match: (path) => /\/pipelines\/50\/jobs$/.test(path),
				respond: () =>
					failResult(
						new GitLabRequestError({
							code: 'rate-limited',
							provider: 'gitlab',
							message: 'gitlab request hit a rate limit',
							status: 429,
							requestId: 'req-429',
							retryAfterSeconds: 30,
							temporary: true,
							retryable: false,
						}),
					),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 50 },
		);
		expect(result.run.value?.jobs).toEqual([]);
		expect(result.run.availability).toBe('partial');
	});

	it('uses a plain {code, provider} error object thrown without a remoteError wrapper', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/51$/.test(path),
				respond: () =>
					okResult({ id: 51, status: 'failed', sha: 'sha51' }),
			},
			{
				match: (path) => /\/pipelines\/51\/jobs$/.test(path),
				respond: () =>
					failResult({
						code: 'forbidden',
						provider: 'gitlab',
						message: 'blocked',
						status: 403,
						requestId: null,
						retryAfterSeconds: null,
						temporary: false,
						retryable: false,
					}),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 51 },
		);
		expect(result.run.availability).toBe('partial');
	});

	it('falls back to an invalid-response error for a generic thrown Error', async () => {
		const client = createFakeClient([
			{
				match: (path) => /\/pipelines\/52$/.test(path),
				respond: () =>
					okResult({ id: 52, status: 'failed', sha: 'sha52' }),
			},
			{
				match: (path) => /\/pipelines\/52\/jobs$/.test(path),
				respond: () => failResult(new Error('unexpected boom')),
			},
		]);
		const result = await diagnoseGitLabPipeline(
			{ context, client },
			{ projectPath: 'cartago/delendai', pipelineId: 52 },
		);
		expect(result.run.availability).toBe('partial');
	});
});
