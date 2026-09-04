import type {
	IRemoteDiagnosticArtifact,
	IRemoteDiagnosticCommit,
	IRemoteDiagnosticJob,
	IRemoteDiagnosticLimits,
	IRemoteDiagnosticReview,
	IRemoteDiagnosticRunCandidate,
	IRemoteDiagnosticResult,
} from '@delendai/contracts/remote-diagnostics';
import type {
	IRemoteGitRef,
	IRemoteProjectCoordinates,
	IRemoteProviderError,
	IRemoteProviderSuccess,
} from '@delendai/contracts/remote-provider';
import {
	DEFAULT_REMOTE_DIAGNOSTIC_LIMITS,
	diagnoseRemoteExecution,
} from '@delendai/remote-provider-core';
import z from 'zod';

import type { createGitHubHttpClient } from './client';
import type { IGitHubProviderContext } from './config';

const objectSchema = z.record(z.string(), z.unknown());

const RELEVANT_JOB_STATUSES = new Set([
	'failed',
	'canceled',
	'timed-out',
	'queued',
	'running',
]);

type GitHubClient = ReturnType<typeof createGitHubHttpClient>;

export interface IGitHubWorkflowDiagnosticInput {
	readonly owner?: string;
	readonly repository?: string;
	readonly workflowId?: string | number;
	readonly runId?: string | number;
	readonly pullRequestNumber?: string | number;
	readonly sha?: string;
	readonly ref?: string;
	readonly status?: string;
	readonly limits?: Partial<IRemoteDiagnosticLimits>;
}

export interface IGitHubWorkflowDiagnosticOptions {
	readonly context: IGitHubProviderContext;
	readonly client: GitHubClient;
}

type AsyncResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: IRemoteProviderError };

const asRecord = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: {};

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asBoolean = (value: unknown): boolean | undefined =>
	typeof value === 'boolean' ? value : undefined;

const inferProviderError = (
	error: unknown,
	fallbackMessage: string,
): IRemoteProviderError => {
	if (
		error !== null &&
		typeof error === 'object' &&
		'remoteError' in error &&
		(error as { remoteError?: unknown }).remoteError !== undefined
	) {
		return (error as { remoteError: IRemoteProviderError }).remoteError;
	}
	if (
		error !== null &&
		typeof error === 'object' &&
		'code' in error &&
		'provider' in error
	) {
		return error as IRemoteProviderError;
	}
	return {
		code: 'invalid-response',
		provider: 'github',
		message: error instanceof Error ? error.message : fallbackMessage,
		status: null,
		requestId: null,
		retryAfterSeconds: null,
		temporary: false,
		retryable: false,
	};
};

const attempt = async <T>(
	load: Promise<T>,
	fallbackMessage: string,
): Promise<AsyncResult<T>> => {
	try {
		return { ok: true, value: await load };
	} catch (error) {
		return {
			ok: false,
			error: inferProviderError(error, fallbackMessage),
		};
	}
};

const resolveRepository = (
	context: IGitHubProviderContext,
	input: IGitHubWorkflowDiagnosticInput,
): IRemoteProjectCoordinates => {
	const owner = input.owner ?? context.repository?.owner;
	const repository = input.repository ?? context.repository?.repository;
	if (owner === undefined || repository === undefined) {
		throw new Error(
			'GitHub diagnostics require owner and repository, either explicitly or via the plugin defaultRepository context.',
		);
	}
	const inherited =
		context.repository?.owner === owner &&
		context.repository?.repository === repository
			? context.repository
			: null;
	return {
		provider: 'github',
		host: context.host,
		owner,
		repository,
		displayName: inherited?.displayName ?? `${owner}/${repository}`,
		webUrl:
			inherited?.webUrl ?? `${context.webBaseUrl}/${owner}/${repository}`,
		apiUrl:
			inherited?.apiUrl ??
			`${context.apiBaseUrl}/repos/${owner}/${repository}`,
	};
};

const buildBranchRef = (
	project: IRemoteProjectCoordinates,
	name: string | undefined,
	sha: string | undefined,
): IRemoteGitRef | undefined => {
	if (
		name === undefined ||
		project.owner === undefined ||
		project.repository === undefined
	)
		return undefined;
	return {
		kind: 'branch',
		name,
		fullName: name.startsWith('refs/') ? name : `refs/heads/${name}`,
		...(sha !== undefined ? { sha } : {}),
		url: `${project.webUrl}/tree/${encodeURIComponent(name)}`,
	};
};

const mapCompletedConclusion = (
	conclusion: string | undefined,
): IRemoteDiagnosticJob['status'] => {
	switch (conclusion) {
		case 'success':
			return 'success';
		case 'failure':
		case 'action_required':
		case 'startup_failure':
		case 'stale':
			return 'failed';
		case 'cancelled':
			return 'canceled';
		case 'timed_out':
			return 'timed-out';
		case 'skipped':
			return 'skipped';
		case 'neutral':
			return 'neutral';
		default:
			return 'unknown';
	}
};

const mapExecutionStatus = (
	status: string | undefined,
	conclusion: string | undefined,
): IRemoteDiagnosticJob['status'] => {
	switch (status) {
		case 'queued':
		case 'pending':
		case 'requested':
		case 'waiting':
			return 'queued';
		case 'in_progress':
		case 'running':
			return 'running';
		case 'completed':
			return mapCompletedConclusion(conclusion);
		default:
			return mapCompletedConclusion(conclusion);
	}
};

const mapArtifact = (value: unknown): IRemoteDiagnosticArtifact => {
	const item = asRecord(value);
	const sizeBytes = asNumber(item.size_in_bytes);
	const expired = asBoolean(item.expired);
	const url = asString(item.url);
	const downloadUrl = asString(item.archive_download_url);
	return {
		id: asNumber(item.id) ?? asString(item.id) ?? 'unknown-artifact',
		name: asString(item.name) ?? 'artifact',
		kind: 'archive',
		...(sizeBytes !== undefined ? { sizeBytes } : {}),
		...(expired !== undefined ? { expired } : {}),
		...(url !== undefined ? { url } : {}),
		...(downloadUrl !== undefined ? { downloadUrl } : {}),
	};
};

const mapRun = (
	project: IRemoteProjectCoordinates,
	value: unknown,
): IRemoteDiagnosticRunCandidate['run'] => {
	const item = asRecord(value);
	const sha = asString(item.head_sha);
	const branch = asString(item.head_branch);
	const ref =
		branch === undefined ? undefined : buildBranchRef(project, branch, sha);
	const conclusion = asString(item.conclusion);
	const number = asNumber(item.run_number);
	const createdAt = asString(item.created_at);
	const startedAt = asString(item.run_started_at);
	const finishedAt = asString(item.updated_at);
	const url = asString(item.url);
	const webUrl = asString(item.html_url);
	return {
		id: asNumber(item.id) ?? asString(item.id) ?? 'unknown-run',
		kind: 'workflow-run',
		name:
			asString(item.display_title) ??
			asString(item.name) ??
			'GitHub workflow run',
		status: mapExecutionStatus(
			asString(item.status),
			asString(item.conclusion),
		),
		...(conclusion !== undefined ? { conclusion } : {}),
		...(number !== undefined ? { number } : {}),
		...(createdAt !== undefined ? { createdAt } : {}),
		...(startedAt !== undefined ? { startedAt } : {}),
		...(finishedAt !== undefined ? { finishedAt } : {}),
		...(sha !== undefined ? { sha } : {}),
		...(ref !== undefined ? { ref } : {}),
		...(url !== undefined ? { url } : {}),
		...(webUrl !== undefined ? { webUrl } : {}),
	};
};

const mapJob = (
	project: IRemoteProjectCoordinates,
	sha: string | undefined,
	branch: string | undefined,
	value: unknown,
): IRemoteDiagnosticJob => {
	const item = asRecord(value);
	const runnerName = asString(item.runner_name);
	const conclusion = asString(item.conclusion);
	const startedAt = asString(item.started_at);
	const finishedAt = asString(item.completed_at);
	const htmlUrl = asString(item.html_url);
	const itemUrl = asString(item.url);
	const ref =
		branch === undefined ? undefined : buildBranchRef(project, branch, sha);
	const labels = Array.isArray(item.labels)
		? item.labels.filter(
				(entry): entry is string => typeof entry === 'string',
			)
		: [];
	return {
		id: asNumber(item.id) ?? asString(item.id) ?? 'unknown-job',
		name: asString(item.name) ?? 'job',
		status: mapExecutionStatus(
			asString(item.status),
			asString(item.conclusion),
		),
		...(conclusion !== undefined ? { conclusion } : {}),
		...(startedAt !== undefined ? { startedAt } : {}),
		...(finishedAt !== undefined ? { finishedAt } : {}),
		...(htmlUrl !== undefined
			? {
					url: itemUrl ?? htmlUrl,
					webUrl: htmlUrl,
				}
			: {}),
		...(ref !== undefined ? { ref } : {}),
		...(sha !== undefined ? { sha } : {}),
		...(runnerName !== undefined
			? { runnerLabel: runnerName }
			: labels.length > 0
				? { runnerLabel: labels.join(', ') }
				: {}),
	};
};

const mapCommit = (value: unknown): IRemoteDiagnosticCommit => {
	const item = asRecord(value);
	const innerCommit = asRecord(item.commit);
	const author = asRecord(innerCommit.author);
	const message = asString(innerCommit.message);
	const title = message?.split('\n')[0]?.trim();
	const authorName = asString(author.name);
	const authoredAt = asString(author.date);
	const url = asString(item.html_url);
	return {
		sha: asString(item.sha) ?? 'unknown-sha',
		...(title !== undefined && title.length > 0 ? { title } : {}),
		...(message !== undefined ? { message } : {}),
		...(authorName !== undefined ? { authorName } : {}),
		...(authoredAt !== undefined ? { authoredAt } : {}),
		...(url !== undefined ? { url } : {}),
	};
};

const mapPullRequest = (
	project: IRemoteProjectCoordinates,
	value: unknown,
): IRemoteDiagnosticReview => {
	const item = asRecord(value);
	const head = asRecord(item.head);
	const base = asRecord(item.base);
	const headSha = asString(head.sha);
	const headRef = asString(head.ref);
	const baseRef = asString(base.ref);
	const title = asString(item.title);
	const url = asString(item.html_url);
	const sourceRef =
		headRef === undefined
			? undefined
			: buildBranchRef(project, headRef, headSha);
	const targetRef =
		baseRef === undefined
			? undefined
			: buildBranchRef(project, baseRef, asString(base.sha));
	return {
		id: asNumber(item.id) ?? asString(item.id) ?? 'unknown-pr',
		number:
			asNumber(item.number) ??
			asString(item.number) ??
			'unknown-pr-number',
		kind: 'pull-request',
		state:
			asString(item.merged_at) !== undefined
				? 'merged'
				: asString(item.state) === 'open'
					? 'open'
					: asString(item.state) === 'closed'
						? 'closed'
						: asBoolean(item.draft) === true
							? 'draft'
							: 'unknown',
		...(title !== undefined ? { title } : {}),
		...(url !== undefined ? { url } : {}),
		...(sourceRef !== undefined ? { sourceRef } : {}),
		...(targetRef !== undefined ? { targetRef } : {}),
		...(headSha !== undefined ? { headSha } : {}),
	};
};

const fetchObject = async (
	client: GitHubClient,
	path: string,
	query?: Record<string, string | number | undefined>,
): Promise<IRemoteProviderSuccess<Record<string, unknown>>> =>
	client.request({
		path,
		...(query !== undefined ? { query } : {}),
		responseSchema: objectSchema,
	});

const fetchText = async (
	client: GitHubClient,
	path: string,
): Promise<IRemoteProviderSuccess<string>> =>
	client.request({ path, parseAs: 'text' });

const isRelevantJob = (job: IRemoteDiagnosticJob): boolean =>
	RELEVANT_JOB_STATUSES.has(job.status);

const compareTimestampDesc = (
	left: IRemoteDiagnosticJob,
	right: IRemoteDiagnosticJob,
): number => {
	const toMillis = (value: string | undefined): number => {
		if (value === undefined) return 0;
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : 0;
	};
	return (
		Math.max(toMillis(right.finishedAt), toMillis(right.startedAt)) -
		Math.max(toMillis(left.finishedAt), toMillis(left.startedAt))
	);
};

export const diagnoseGitHubWorkflow = async (
	options: IGitHubWorkflowDiagnosticOptions,
	input: IGitHubWorkflowDiagnosticInput,
): Promise<IRemoteDiagnosticResult> => {
	const project = resolveRepository(options.context, input);
	const limits = {
		...DEFAULT_REMOTE_DIAGNOSTIC_LIMITS,
		...input.limits,
	};

	const reviewPromise =
		input.pullRequestNumber === undefined
			? Promise.resolve<IRemoteDiagnosticReview | undefined>(undefined)
			: attempt(
					fetchObject(
						options.client,
						`/repos/${project.owner}/${project.repository}/pulls/${String(input.pullRequestNumber)}`,
					),
					'GitHub pull request lookup failed',
				).then((result) =>
					result.ok
						? mapPullRequest(project, result.value.data)
						: undefined,
				);

	const selectedRun =
		await (async (): Promise<IRemoteDiagnosticRunCandidate | null> => {
			if (input.runId !== undefined) {
				const [runResult, jobsResult, artifactsResult] =
					await Promise.all([
						fetchObject(
							options.client,
							`/repos/${project.owner}/${project.repository}/actions/runs/${String(input.runId)}`,
						),
						attempt(
							fetchObject(
								options.client,
								`/repos/${project.owner}/${project.repository}/actions/runs/${String(input.runId)}/jobs`,
								{ per_page: 100, page: 1 },
							),
							'GitHub jobs lookup failed',
						),
						attempt(
							fetchObject(
								options.client,
								`/repos/${project.owner}/${project.repository}/actions/runs/${String(input.runId)}/artifacts`,
								{ per_page: 100, page: 1 },
							),
							'GitHub artifacts lookup failed',
						),
					]);
				const run = mapRun(project, runResult.data);
				const rawJobs = Array.isArray(
					asRecord(jobsResult.ok ? jobsResult.value.data : {}).jobs,
				)
					? (asRecord(jobsResult.ok ? jobsResult.value.data : {})
							.jobs as unknown[])
					: [];
				const jobs = rawJobs.map((job) =>
					mapJob(
						project,
						run.sha,
						asString(asRecord(run.ref).name) ??
							asString(asRecord(run.ref).fullName),
						job,
					),
				);
				const candidateErrors: IRemoteProviderError[] = [];
				if (!jobsResult.ok) candidateErrors.push(jobsResult.error);
				if (!artifactsResult.ok)
					candidateErrors.push(artifactsResult.error);

				const logsTarget = jobs
					.filter((job) => isRelevantJob(job))
					.sort(compareTimestampDesc)
					.slice(0, limits.maxRelevantJobs);
				const logsByJob = new Map<
					IRemoteDiagnosticJob['id'],
					IRemoteDiagnosticJob['log']
				>();
				const logResults = await Promise.all(
					logsTarget.map(async (job) => {
						const startedAt = Date.now();
						const result = await attempt(
							fetchText(
								options.client,
								`/repos/${project.owner}/${project.repository}/actions/jobs/${String(job.id)}/logs`,
							),
							'GitHub job log lookup failed',
						);
						return { job, startedAt, result };
					}),
				);
				for (const entry of logResults) {
					if (entry.result.ok) {
						logsByJob.set(entry.job.id, {
							text: entry.result.value.data,
							...(entry.job.webUrl !== undefined
								? { url: entry.job.webUrl }
								: {}),
							durationMs: Date.now() - entry.startedAt,
						});
					} else {
						candidateErrors.push(entry.result.error);
						logsByJob.set(entry.job.id, {
							...(entry.job.webUrl !== undefined
								? { url: entry.job.webUrl }
								: {}),
							durationMs: Date.now() - entry.startedAt,
							error: entry.result.error,
						});
					}
				}

				const runArtifacts = artifactsResult.ok
					? Array.isArray(
							asRecord(artifactsResult.value.data).artifacts,
						)
						? (
								asRecord(artifactsResult.value.data)
									.artifacts as unknown[]
							).map((artifact) => mapArtifact(artifact))
						: []
					: [];

				return {
					run,
					jobs: jobs.map((job) => ({
						...job,
						...(logsByJob.has(job.id)
							? { log: logsByJob.get(job.id) ?? null }
							: {}),
					})),
					artifacts: runArtifacts,
					...(candidateErrors.length > 0
						? { errors: candidateErrors, partial: true }
						: {}),
				};
			}

			const runsResult = await fetchObject(
				options.client,
				input.workflowId !== undefined
					? `/repos/${project.owner}/${project.repository}/actions/workflows/${String(input.workflowId)}/runs`
					: `/repos/${project.owner}/${project.repository}/actions/runs`,
				{
					per_page: Math.max(10, limits.maxRelevantJobs),
					page: 1,
					...(input.ref !== undefined ? { branch: input.ref } : {}),
					...(input.status !== undefined
						? { status: input.status }
						: {}),
				},
			);
			const workflowRuns = Array.isArray(
				asRecord(runsResult.data).workflow_runs,
			)
				? (asRecord(runsResult.data).workflow_runs as unknown[])
				: [];
			const latest = workflowRuns[0];
			if (latest === undefined) return null;
			const summary = mapRun(project, latest);
			const detail = await attempt(
				fetchObject(
					options.client,
					`/repos/${project.owner}/${project.repository}/actions/runs/${String(summary.id)}`,
				),
				'GitHub workflow run lookup failed',
			);
			if (!detail.ok) {
				return {
					run: summary,
					errors: [detail.error],
					partial: true,
				};
			}
			const detailedRun = mapRun(project, detail.value.data);
			return {
				run: detailedRun,
			};
		})();

	const review = await reviewPromise;
	const resolvedSha = input.sha ?? review?.headSha ?? selectedRun?.run.sha;
	const commit =
		resolvedSha === undefined
			? undefined
			: await attempt(
					fetchObject(
						options.client,
						`/repos/${project.owner}/${project.repository}/commits/${resolvedSha}`,
					),
					'GitHub commit lookup failed',
				).then((result) =>
					result.ok
						? mapCommit(result.value.data)
						: { sha: resolvedSha },
				);
	const ref =
		input.ref !== undefined
			? buildBranchRef(project, input.ref, resolvedSha)
			: (review?.sourceRef ?? selectedRun?.run.ref);

	return diagnoseRemoteExecution({
		provider: 'github',
		resource: {
			project,
			...(ref !== undefined ? { ref } : {}),
			...(commit !== undefined ? { commit } : {}),
			...(review !== undefined ? { review } : {}),
		},
		runs: selectedRun === null ? [] : [selectedRun],
		...(input.limits !== undefined ? { limits: input.limits } : {}),
	});
};
