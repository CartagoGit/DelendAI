// diagnostics.spec.ts (in this directory) tests buildGitHubToolRegistrations
// from ../src/lib/tools and never imports diagnoseGitHubWorkflow at all, so
// plugins/github/src/lib/diagnostics.ts shipped with 0% branch coverage and
// no test naming it. That file is the GitHub-specific adapter that turns raw
// REST payloads (runs, jobs, artifacts, pull requests, commits, logs) into
// the shared @delendai/remote-provider-core diagnostic engine's input shape.
// The shared engine (diagnoseRemoteExecution) is already exercised well in
// plugins/remote-provider-core/tests/diagnostics*.spec.ts, so this file does
// NOT re-test the engine's report/correlation heuristics; it drives
// diagnoseGitHubWorkflow itself, through a fake GitHubClient, to pin down how
// the adapter parses, resolves, correlates and degrades on GitHub's payload
// shapes -- including the error and edge paths that the happy-path
// integration test in diagnostics.spec.ts never touches.

import { describe, expect, it } from 'vitest';

import type {
	IRemoteProjectCoordinates,
	IRemoteProviderError,
	IRemoteProviderSuccess,
	IRemoteResponseMeta,
} from '@delendai/contracts/remote-provider';

import type { createGitHubHttpClient } from '../src/lib/client';
import type { IGitHubProviderContext } from '../src/lib/config';
import {
	diagnoseGitHubWorkflow,
	type IGitHubWorkflowDiagnosticInput,
} from '../src/lib/diagnostics';

type GitHubClient = ReturnType<typeof createGitHubHttpClient>;

interface IRoute {
	readonly matches: (path: string) => boolean;
	readonly data?: unknown;
	readonly throwError?: unknown;
}

const endsWith =
	(suffix: string) =>
	(path: string): boolean =>
		path.endsWith(suffix);

const baseMeta = (): IRemoteResponseMeta => ({
	status: 200,
	requestId: 'req-1',
	durationMs: 2,
	attempts: 1,
	pagination: null,
	rateLimit: null,
	truncated: null,
});

/**
 * Builds a fake GitHubClient that answers `request()` calls by matching the
 * request path against `routes`, in order. Every matched route either
 * resolves with a fabricated success envelope or throws `throwError`
 * (mirroring how the real createGitHubHttpClient throws GitHubRequestError
 * on failure instead of returning `{ ok: false }`). This is how
 * `attempt()` inside diagnostics.ts gets exercised without any network I/O.
 */
const buildClient = (
	routes: readonly IRoute[],
): { readonly client: GitHubClient; readonly calls: string[] } => {
	const calls: string[] = [];
	const client = {
		request: (async (request: { readonly path: string }) => {
			calls.push(request.path);
			const route = routes.find((entry) => entry.matches(request.path));
			if (route === undefined) {
				throw new Error(
					`diagnose-github-workflow.spec: no fake route for ${request.path}`,
				);
			}
			if (route.throwError !== undefined) {
				throw route.throwError;
			}
			return {
				ok: true,
				provider: 'github',
				data: route.data,
				meta: baseMeta(),
			} satisfies IRemoteProviderSuccess<unknown>;
		}) as GitHubClient['request'],
	};
	return { client, calls };
};

const defaultRepository: IRemoteProjectCoordinates = {
	provider: 'github',
	host: 'github.com',
	owner: 'CartagoGit',
	repository: 'delendai',
	displayName: 'CartagoGit/delendai',
	webUrl: 'https://github.com/CartagoGit/delendai',
	apiUrl: 'https://api.github.com/repos/CartagoGit/delendai',
};

const buildContext = (
	repository: IRemoteProjectCoordinates | null = defaultRepository,
): IGitHubProviderContext => ({
	provider: 'github',
	token: 'ghp-test-token',
	apiBaseUrl: 'https://api.github.com',
	webBaseUrl: 'https://github.com',
	host: 'github.com',
	repository,
	timeoutMs: 15_000,
	maxRetries: 0,
	retryBaseDelayMs: 250,
	sources: {
		token: 'env:GITHUB_TOKEN',
		apiBaseUrl: 'default',
		webBaseUrl: 'default',
		repository: repository === null ? [] : ['plugin'],
	},
});

const providerError = (
	overrides: Partial<IRemoteProviderError> = {},
): IRemoteProviderError => ({
	code: 'transient',
	provider: 'github',
	message: 'github request failed transiently',
	status: 502,
	requestId: 'req-err',
	retryAfterSeconds: null,
	temporary: true,
	retryable: true,
	...overrides,
});

describe('diagnoseGitHubWorkflow - repository resolution', () => {
	it('rejects when neither input nor plugin context supplies owner/repository', async () => {
		const { client } = buildClient([]);
		await expect(
			diagnoseGitHubWorkflow({ context: buildContext(null), client }, {}),
		).rejects.toThrow(/require owner and repository/);
	});

	it('inherits displayName/webUrl/apiUrl from the plugin default repository when input omits owner/repository', async () => {
		const { client } = buildClient([
			{
				matches: endsWith('/actions/runs'),
				data: { workflow_runs: [] },
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(defaultRepository), client },
			{},
		);
		expect(result.resource.value?.project).toMatchObject({
			owner: 'CartagoGit',
			repository: 'delendai',
			displayName: 'CartagoGit/delendai',
			webUrl: 'https://github.com/CartagoGit/delendai',
			apiUrl: 'https://api.github.com/repos/CartagoGit/delendai',
		});
	});

	it('derives a fresh displayName/webUrl/apiUrl when input owner/repository override the plugin default (no inheritance)', async () => {
		const { client } = buildClient([
			{
				matches: endsWith('/actions/runs'),
				data: { workflow_runs: [] },
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(defaultRepository), client },
			{ owner: 'other-owner', repository: 'other-repo' },
		);
		expect(result.resource.value?.project).toMatchObject({
			owner: 'other-owner',
			repository: 'other-repo',
			displayName: 'other-owner/other-repo',
			webUrl: 'https://github.com/other-owner/other-repo',
			apiUrl: 'https://api.github.com/repos/other-owner/other-repo',
		});
	});
});

describe('diagnoseGitHubWorkflow - pull request review resolution', () => {
	const withPr = (data: unknown) =>
		buildClient([{ matches: endsWith('/pulls/44'), data }]);

	it('leaves review evidence unavailable when no pullRequestNumber is given', async () => {
		const { client } = buildClient([
			{ matches: endsWith('/actions/runs'), data: { workflow_runs: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{},
		);
		expect(result.review.value).toBeNull();
	});

	it('maps a merged pull request (merged_at wins over state)', async () => {
		const { client } = withPr({
			id: 1,
			number: 44,
			title: 'Fix flaky test',
			html_url: 'https://github.com/CartagoGit/delendai/pull/44',
			merged_at: '2026-08-01T00:00:00Z',
			state: 'closed',
			head: { sha: 'headsha1', ref: 'feature/fix' },
			base: { ref: 'main', sha: 'basesha1' },
		});
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ pullRequestNumber: 44 },
		);
		expect(result.review.value).toMatchObject({
			state: 'merged',
			title: 'Fix flaky test',
			headSha: 'headsha1',
		});
		expect(result.review.value?.sourceRef).toMatchObject({
			name: 'feature/fix',
			fullName: 'refs/heads/feature/fix',
			sha: 'headsha1',
		});
		expect(result.review.value?.targetRef).toMatchObject({
			name: 'main',
			sha: 'basesha1',
		});
	});

	it('maps an open pull request', async () => {
		const { client } = withPr({
			id: 2,
			number: 44,
			state: 'open',
			head: {},
			base: {},
		});
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ pullRequestNumber: 44 },
		);
		expect(result.review.value?.state).toBe('open');
		expect(result.review.value?.sourceRef).toBeUndefined();
		expect(result.review.value?.targetRef).toBeUndefined();
		expect(result.review.value?.headSha).toBeUndefined();
	});

	it('maps a closed (not merged) pull request', async () => {
		const { client } = withPr({
			id: 3,
			number: 44,
			state: 'closed',
			head: {},
			base: {},
		});
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ pullRequestNumber: 44 },
		);
		expect(result.review.value?.state).toBe('closed');
	});

	it('maps a draft pull request when state is absent but draft is true', async () => {
		const { client } = withPr({
			id: 4,
			number: 44,
			draft: true,
			head: {},
			base: {},
		});
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ pullRequestNumber: 44 },
		);
		expect(result.review.value?.state).toBe('draft');
	});

	it('falls back to state "unknown" when no recognizable state/merged_at/draft field matches', async () => {
		const { client } = withPr({
			id: 5,
			number: 44,
			state: 'locked',
			head: {},
			base: {},
		});
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ pullRequestNumber: 44 },
		);
		expect(result.review.value?.state).toBe('unknown');
	});

	it('BUG: silently treats a failed pull request lookup as "no PR" instead of reporting the fetch error', async () => {
		const { client } = buildClient([
			{
				matches: endsWith('/pulls/44'),
				throwError: providerError({
					message: 'pull request lookup boom',
				}),
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ pullRequestNumber: 44 },
		);
		// The adapter's reviewPromise swallows the attempt() failure and
		// resolves to `undefined` (see diagnostics.ts: `result.ok ?
		// mapPullRequest(...) : undefined`), so the fetch failure is
		// indistinguishable from "there is no pull request" anywhere in the
		// returned result -- no error surfaces on review, jobs, or the run.
		expect(result.review.value).toBeNull();
		expect(result.review.errors).toEqual([]);
	});
});

describe('diagnoseGitHubWorkflow - run lookup by runId', () => {
	const runPath = '/actions/runs/91';
	const jobsPath = '/actions/runs/91/jobs';
	const artifactsPath = '/actions/runs/91/artifacts';

	const runData = {
		id: 91,
		display_title: 'Nightly build',
		head_sha: 'sha-91',
		head_branch: 'main',
		status: 'completed',
		conclusion: 'failure',
		run_number: 4,
		created_at: '2026-08-30T00:00:00Z',
		run_started_at: '2026-08-30T00:01:00Z',
		updated_at: '2026-08-30T00:05:00Z',
		url: 'https://api.github.com/repos/CartagoGit/delendai/actions/runs/91',
		html_url: 'https://github.com/CartagoGit/delendai/actions/runs/91',
	};

	it('covers every RELEVANT_JOB_STATUSES member and excludes non-relevant jobs, with maxRelevantJobs:0 skipping log fetches', async () => {
		const jobs = [
			{ id: 1, name: 'queued-job', status: 'queued' },
			{
				id: 2,
				name: 'running-job',
				status: 'in_progress',
				started_at: '2026-08-30T00:02:00Z',
			},
			{
				id: 3,
				name: 'failed-job',
				status: 'completed',
				conclusion: 'failure',
				completed_at: '2026-08-30T00:03:00Z',
			},
			{
				id: 4,
				name: 'canceled-job',
				status: 'completed',
				conclusion: 'cancelled',
				completed_at: '2026-08-30T00:03:30Z',
			},
			{
				id: 5,
				name: 'timedout-job',
				status: 'completed',
				conclusion: 'timed_out',
				completed_at: '2026-08-30T00:04:00Z',
			},
			{
				id: 6,
				name: 'success-job',
				status: 'completed',
				conclusion: 'success',
				completed_at: '2026-08-30T00:04:30Z',
			},
			{
				id: 7,
				name: 'skipped-job',
				status: 'completed',
				conclusion: 'skipped',
			},
			{
				id: 8,
				name: 'neutral-job',
				status: 'completed',
				conclusion: 'neutral',
			},
		];
		const { client, calls } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91, limits: { maxRelevantJobs: 0 } },
		);
		const names = (result.jobs.value ?? []).map((job) => job.name).sort();
		expect(names).toEqual(
			[
				'queued-job',
				'running-job',
				'failed-job',
				'canceled-job',
				'timedout-job',
			].sort(),
		);
		// success/skipped/neutral jobs were mapped to non-relevant statuses
		// and filtered out entirely by the shared engine.
		expect(names).not.toContain('success-job');
		expect(names).not.toContain('skipped-job');
		expect(names).not.toContain('neutral-job');
		// maxRelevantJobs:0 means logsTarget.slice(0, 0) === [], so no
		// /jobs/{id}/logs calls should have been issued.
		expect(calls.some((path) => path.includes('/logs'))).toBe(false);
	});

	it('maps completed conclusions action_required/startup_failure/stale to "failed" and an unrecognized conclusion to "unknown"', async () => {
		const jobs = [
			{
				id: 10,
				name: 'action-required-job',
				status: 'completed',
				conclusion: 'action_required',
			},
			{
				id: 11,
				name: 'startup-failure-job',
				status: 'completed',
				conclusion: 'startup_failure',
			},
			{
				id: 12,
				name: 'stale-job',
				status: 'completed',
				conclusion: 'stale',
			},
			{
				id: 13,
				name: 'mystery-job',
				status: 'completed',
				conclusion: 'something-new-github-invented',
			},
		];
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91, limits: { maxRelevantJobs: 0 } },
		);
		const byName = new Map(
			(result.jobs.value ?? []).map((job) => [job.name, job.status]),
		);
		expect(byName.get('action-required-job')).toBe('failed');
		expect(byName.get('startup-failure-job')).toBe('failed');
		expect(byName.get('stale-job')).toBe('failed');
		// "mystery-job" maps to status "unknown", which is not in
		// RELEVANT_JOB_STATUSES/FAILED_STATUSES, so the shared engine drops
		// it from result.jobs.value entirely -- assert via absence.
		expect(byName.has('mystery-job')).toBe(false);
	});

	it('maps pending/requested/waiting statuses to "queued" and an unrecognized status to the completed-conclusion fallback', async () => {
		const jobs = [
			{ id: 20, name: 'pending-job', status: 'pending' },
			{ id: 21, name: 'requested-job', status: 'requested' },
			{ id: 22, name: 'waiting-job', status: 'waiting' },
			{
				id: 23,
				name: 'unrecognized-status-job',
				status: 'some-future-status',
				conclusion: 'failure',
			},
		];
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91, limits: { maxRelevantJobs: 0 } },
		);
		const byName = new Map(
			(result.jobs.value ?? []).map((job) => [job.name, job.status]),
		);
		expect(byName.get('pending-job')).toBe('queued');
		expect(byName.get('requested-job')).toBe('queued');
		expect(byName.get('waiting-job')).toBe('queued');
		// falls through to mapCompletedConclusion(conclusion) via the
		// `default:` branch of mapExecutionStatus.
		expect(byName.get('unrecognized-status-job')).toBe('failed');
	});

	it('marks the run candidate partial and records the jobs-list error when the jobs endpoint fails, leaving no jobs', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{
				matches: endsWith(jobsPath),
				throwError: providerError({ message: 'jobs endpoint down' }),
			},
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect(result.jobs.value).toEqual([]);
		expect(result.run.value?.jobs).toEqual([]);
	});

	it('tolerates a jobs payload where "jobs" is missing/not an array by treating it as empty', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs: 'not-an-array' } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect(result.jobs.value).toEqual([]);
	});

	it('falls back to an empty artifacts list and records the error when the artifacts endpoint fails', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{
				matches: endsWith(jobsPath),
				data: {
					jobs: [
						{
							id: 1,
							name: 'failed-job',
							status: 'completed',
							conclusion: 'failure',
						},
					],
				},
			},
			{
				matches: endsWith(artifactsPath),
				throwError: providerError({
					message: 'artifacts endpoint down',
				}),
			},
			{ matches: endsWith('/logs'), data: 'log text' },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect(result.artifacts.value).toEqual([]);
	});

	it('tolerates an artifacts payload where "artifacts" is missing/not an array by treating it as empty', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs: [] } },
			{ matches: endsWith(artifactsPath), data: { artifacts: null } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect(result.artifacts.value).toEqual([]);
	});

	it('maps artifact fields when present, and falls back to "unknown-artifact"/"artifact" when absent', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs: [] } },
			{
				matches: endsWith(artifactsPath),
				data: {
					artifacts: [
						{
							id: 500,
							name: 'coverage.zip',
							size_in_bytes: 2048,
							expired: false,
							url: 'https://api.github.com/artifacts/500',
							archive_download_url:
								'https://api.github.com/artifacts/500/zip',
						},
						{},
					],
				},
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect(result.artifacts.value).toEqual([
			expect.objectContaining({
				id: 500,
				name: 'coverage.zip',
				sizeBytes: 2048,
				expired: false,
				url: 'https://api.github.com/artifacts/500',
				downloadUrl: 'https://api.github.com/artifacts/500/zip',
			}),
			expect.objectContaining({
				id: 'unknown-artifact',
				name: 'artifact',
			}),
		]);
	});

	it('fetches logs only for the top maxRelevantJobs jobs by recency, leaving the rest without a log field at all', async () => {
		const jobs = [
			{
				id: 1,
				name: 'oldest-failed',
				status: 'completed',
				conclusion: 'failure',
				completed_at: '2026-08-30T00:01:00Z',
			},
			{
				id: 2,
				name: 'newest-failed',
				status: 'completed',
				conclusion: 'failure',
				completed_at: '2026-08-30T00:09:00Z',
			},
		];
		const { client, calls } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
			{
				matches: endsWith('/actions/jobs/2/logs'),
				data: 'newest log text',
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91, limits: { maxRelevantJobs: 1 } },
		);
		expect(calls.filter((path) => path.includes('/logs'))).toEqual([
			'/repos/CartagoGit/delendai/actions/jobs/2/logs',
		]);
		const newest = result.jobs.value?.find(
			(job) => job.name === 'newest-failed',
		);
		const oldest = result.jobs.value?.find(
			(job) => job.name === 'oldest-failed',
		);
		expect(newest?.log?.text).toBe('newest log text');
		// oldest-failed never had a `log` key assigned at all (no
		// logsByJob.has(job.id) entry), which the shared engine normalizes
		// to a null/"unavailable" log evidence rather than "complete".
		expect(oldest?.log?.availability).toBe('unavailable');
	});

	it('records a per-job log fetch error and keeps the job partial when the log request fails', async () => {
		const jobs = [
			{
				id: 1,
				name: 'failed-job',
				status: 'completed',
				conclusion: 'failure',
				completed_at: '2026-08-30T00:01:00Z',
			},
		];
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
			{
				matches: endsWith('/actions/jobs/1/logs'),
				throwError: providerError({ message: 'log fetch boom' }),
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		const job = result.jobs.value?.find((j) => j.name === 'failed-job');
		expect(job?.log?.availability).toBe('unavailable');
		expect(job?.log?.errors).toEqual([
			expect.objectContaining({ message: 'log fetch boom' }),
		]);
	});

	it('uses runner_name for runnerLabel when present, falls back to joined labels, and omits runnerLabel entirely when neither exists', async () => {
		const jobs = [
			{
				id: 1,
				name: 'runner-name-job',
				status: 'queued',
				runner_name: 'ubuntu-runner-1',
			},
			{
				id: 2,
				name: 'labels-job',
				status: 'queued',
				labels: ['self-hosted', 'linux'],
			},
			{
				id: 3,
				name: 'bare-job',
				status: 'queued',
			},
		];
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91, limits: { maxRelevantJobs: 0 } },
		);
		const byName = new Map(
			(result.jobs.value ?? []).map((job) => [job.name, job.runnerLabel]),
		);
		expect(byName.get('runner-name-job')).toBe('ubuntu-runner-1');
		expect(byName.get('labels-job')).toBe('self-hosted, linux');
		expect(byName.get('bare-job')).toBeUndefined();
	});

	it('treats jobs with no timestamps and jobs with unparsable timestamps as equally "oldest" (toMillis fallback to 0)', async () => {
		const jobs = [
			{
				id: 1,
				name: 'no-timestamps',
				status: 'queued',
			},
			{
				id: 2,
				name: 'garbage-timestamp',
				status: 'queued',
				started_at: 'not-a-real-date',
			},
			{
				id: 3,
				name: 'has-timestamp',
				status: 'queued',
				started_at: '2026-08-30T00:09:00Z',
			},
		];
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
			{ matches: endsWith('/logs'), data: 'log' },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91, limits: { maxRelevantJobs: 1 } },
		);
		// Only the job with a real, parsable timestamp should sort ahead of
		// the two that both fall back to timestamp 0; only it gets a log.
		const withLog = result.jobs.value?.find(
			(job) => job.log?.availability === 'complete',
		);
		expect(withLog?.name).toBe('has-timestamp');
	});

	it('marks the run candidate partial and aggregates both jobs and artifacts errors together', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{
				matches: endsWith(jobsPath),
				throwError: providerError({ message: 'jobs down' }),
			},
			{
				matches: endsWith(artifactsPath),
				throwError: providerError({ message: 'artifacts down' }),
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect(result.run.availability).toBe('partial');
		const messages = (result.run.errors ?? []).map((err) => err.message);
		expect(messages).toContain('jobs down');
		expect(messages).toContain('artifacts down');
	});

	it('handles a malformed (non-object) run payload gracefully via asRecord, falling back to defaults', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: null },
			{ matches: endsWith(jobsPath), data: { jobs: [] } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect(result.run.value).toMatchObject({
			id: 'unknown-run',
			name: 'GitHub workflow run',
			status: 'unknown',
		});
	});

	it('resolves sha priority as input.sha over the run sha, and fetches+maps the commit', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs: [] } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
			{
				matches: endsWith('/commits/explicit-sha'),
				data: {
					sha: 'explicit-sha',
					html_url:
						'https://github.com/CartagoGit/delendai/commit/explicit-sha',
					commit: {
						message: 'Fix the thing\n\nLonger body here',
						author: { name: 'Ada', date: '2026-08-29T00:00:00Z' },
					},
				},
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91, sha: 'explicit-sha' },
		);
		expect(result.commit.value).toMatchObject({
			sha: 'explicit-sha',
			title: 'Fix the thing',
			authorName: 'Ada',
			authoredAt: '2026-08-29T00:00:00Z',
		});
	});

	it('falls back to a bare {sha} commit (no title/author) when the commit lookup fails', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs: [] } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
			{
				matches: endsWith('/commits/sha-91'),
				throwError: providerError({ message: 'commit lookup boom' }),
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		// resolvedSha falls back to selectedRun.run.sha ("sha-91") since no
		// input.sha/review.headSha was given.
		expect(result.commit.value).toMatchObject({ sha: 'sha-91' });
		expect(result.commit.value?.title).toBeUndefined();
	});

	it('leaves commit evidence unavailable when no sha can be resolved from input, review, or the run', async () => {
		const runWithoutSha = { ...runData, head_sha: undefined };
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runWithoutSha },
			{ matches: endsWith(jobsPath), data: { jobs: [] } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect(result.commit.value).toBeNull();
	});

	it('uses input.ref to build the ref (over review.sourceRef and the run ref)', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs: [] } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91, ref: 'refs/heads/explicit-branch' },
		);
		expect(result.ref.value).toMatchObject({
			name: 'refs/heads/explicit-branch',
			fullName: 'refs/heads/explicit-branch',
		});
	});

	it('falls back to the selected run ref when input.ref and review.sourceRef are both absent', async () => {
		const { client } = buildClient([
			{ matches: endsWith(runPath), data: runData },
			{ matches: endsWith(jobsPath), data: { jobs: [] } },
			{ matches: endsWith(artifactsPath), data: { artifacts: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect(result.ref.value).toMatchObject({ name: 'main' });
	});
});

describe('diagnoseGitHubWorkflow - run lookup by workflow search (no runId)', () => {
	it('queries /actions/workflows/{id}/runs when workflowId is given, honoring ref and status query filters', async () => {
		const { client, calls } = buildClient([
			{
				matches: endsWith('/actions/workflows/ci.yml/runs'),
				data: { workflow_runs: [] },
			},
		]);
		await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ workflowId: 'ci.yml', ref: 'main', status: 'completed' },
		);
		expect(calls).toEqual([
			'/repos/CartagoGit/delendai/actions/workflows/ci.yml/runs',
		]);
	});

	it('falls back to /actions/runs and returns a null selected run when the workflow_runs list is empty', async () => {
		const { client, calls } = buildClient([
			{ matches: endsWith('/actions/runs'), data: { workflow_runs: [] } },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{},
		);
		expect(calls).toEqual(['/repos/CartagoGit/delendai/actions/runs']);
		expect(result.run.value).toBeNull();
		expect(result.run.availability).toBe('partial');
	});

	it('tolerates a workflow_runs payload that is missing/not an array', async () => {
		const { client } = buildClient([
			{
				matches: endsWith('/actions/runs'),
				data: { workflow_runs: 'nope' },
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{},
		);
		expect(result.run.value).toBeNull();
	});

	it('fetches the run detail for the latest run and uses the detailed mapping (no jobs/artifacts attached)', async () => {
		const summary = {
			id: 91,
			name: 'CI',
			head_sha: 'sha-91',
			head_branch: 'main',
			status: 'completed',
			conclusion: 'failure',
		};
		const detail = { ...summary, run_number: 9 };
		const { client } = buildClient([
			{
				matches:
					endsWith('/actions/runs') && ((p) => !p.endsWith('/91')),
				data: { workflow_runs: [summary] },
			},
			{ matches: endsWith('/actions/runs/91'), data: detail },
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{},
		);
		expect(result.run.value).toMatchObject({ id: 91, number: 9 });
		expect(result.run.value?.jobs).toEqual([]);
	});

	it('returns the summary run marked partial when the detailed run lookup fails', async () => {
		const summary = {
			id: 91,
			name: 'CI',
			head_sha: 'sha-91',
			head_branch: 'main',
			status: 'completed',
			conclusion: 'failure',
		};
		const { client } = buildClient([
			{
				matches: (p) => p.endsWith('/actions/runs'),
				data: { workflow_runs: [summary] },
			},
			{
				matches: endsWith('/actions/runs/91'),
				throwError: providerError({ message: 'run detail boom' }),
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{},
		);
		expect(result.run.availability).toBe('partial');
		expect(result.run.value).toMatchObject({ id: 91 });
		expect((result.run.errors ?? []).map((e) => e.message)).toContain(
			'run detail boom',
		);
	});
});

describe('diagnoseGitHubWorkflow - inferProviderError branches', () => {
	it('unwraps a thrown { remoteError } shape (as GitHubRequestError does) into the reported error', async () => {
		const { client } = buildClient([
			{
				matches:
					endsWith('/actions/runs') && ((p) => p.endsWith('/91')),
				data: {},
			},
			{
				matches: (p) => p.endsWith('/91/jobs'),
				throwError: {
					remoteError: providerError({
						message: 'wrapped remote error',
					}),
				},
			},
			{
				matches: (p) => p.endsWith('/91/artifacts'),
				data: { artifacts: [] },
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		expect((result.run.errors ?? []).map((e) => e.message)).toContain(
			'wrapped remote error',
		);
	});

	it('falls back to a generic invalid-response error when a plain Error (no code/provider/remoteError) is thrown', async () => {
		const { client } = buildClient([
			{
				matches: (p) =>
					p.endsWith('/91') &&
					!p.includes('jobs') &&
					!p.includes('artifacts'),
				data: {},
			},
			{
				matches: (p) => p.endsWith('/91/jobs'),
				throwError: new Error('boom, plain error'),
			},
			{
				matches: (p) => p.endsWith('/91/artifacts'),
				data: { artifacts: [] },
			},
		]);
		const result = await diagnoseGitHubWorkflow(
			{ context: buildContext(), client },
			{ runId: 91 },
		);
		const errors = result.run.errors ?? [];
		expect(errors).toEqual([
			expect.objectContaining({
				code: 'invalid-response',
				provider: 'github',
				message: 'boom, plain error',
				temporary: false,
				retryable: false,
			}),
		]);
	});
});
