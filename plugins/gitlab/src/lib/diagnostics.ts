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

import type { createGitLabHttpClient } from './client';
import type { IGitLabProviderContext } from './config';

const objectSchema = z.record(z.string(), z.unknown());
const arraySchema = z.array(z.record(z.string(), z.unknown()));

const RELEVANT_JOB_STATUSES = new Set([
	'failed',
	'canceled',
	'timed-out',
	'queued',
	'running',
]);

type GitLabClient = ReturnType<typeof createGitLabHttpClient>;

export interface IGitLabPipelineDiagnosticInput {
	readonly projectId?: string | number;
	readonly projectPath?: string;
	readonly pipelineId?: string | number;
	readonly mergeRequestIid?: string | number;
	readonly sha?: string;
	readonly ref?: string;
	readonly status?: string;
	readonly limits?: Partial<IRemoteDiagnosticLimits>;
}

export interface IGitLabPipelineDiagnosticOptions {
	readonly context: IGitLabProviderContext;
	readonly client: GitLabClient;
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
		provider: 'gitlab',
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

const resolveProject = (
	context: IGitLabProviderContext,
	input: IGitLabPipelineDiagnosticInput,
): IRemoteProjectCoordinates => {
	const projectId = input.projectId ?? context.project?.projectId;
	const projectPath = input.projectPath ?? context.project?.projectPath;
	if (projectId === undefined && projectPath === undefined) {
		throw new Error(
			'GitLab diagnostics require projectId or projectPath, either explicitly or via the plugin defaultProject context.',
		);
	}
	const inherited =
		context.project?.projectId === projectId &&
		context.project?.projectPath === projectPath
			? context.project
			: null;
	const displayName =
		inherited?.displayName ??
		projectPath ??
		(projectId !== undefined ? String(projectId) : 'GitLab project');
	return {
		provider: 'gitlab',
		host: context.host,
		...(projectId !== undefined ? { projectId } : {}),
		...(projectPath !== undefined ? { projectPath } : {}),
		displayName,
		webUrl:
			inherited?.webUrl ??
			(projectPath !== undefined
				? `${context.webBaseUrl}/${projectPath}`
				: context.webBaseUrl),
		apiUrl:
			inherited?.apiUrl ??
			`${context.apiBaseUrl}/projects/${encodeURIComponent(String(projectId ?? projectPath))}`,
	};
};

const buildBranchRef = (
	project: IRemoteProjectCoordinates,
	name: string | undefined,
	sha: string | undefined,
): IRemoteGitRef | undefined => {
	if (name === undefined) return undefined;
	return {
		kind: 'branch',
		name,
		fullName: name.startsWith('refs/') ? name : `refs/heads/${name}`,
		...(sha !== undefined ? { sha } : {}),
		...(project.webUrl !== undefined
			? { url: `${project.webUrl}/-/tree/${encodeURIComponent(name)}` }
			: {}),
	};
};

const mapStatus = (
	status: string | undefined,
): IRemoteDiagnosticJob['status'] => {
	switch (status) {
		case 'created':
		case 'pending':
		case 'preparing':
		case 'waiting_for_resource':
		case 'manual':
		case 'scheduled':
			return 'queued';
		case 'running':
			return 'running';
		case 'success':
			return 'success';
		case 'failed':
			return 'failed';
		case 'canceled':
		case 'cancelled':
			return 'canceled';
		case 'skipped':
			return 'skipped';
		case 'timedout':
		case 'timed_out':
			return 'timed-out';
		default:
			return 'unknown';
	}
};

const mapArtifact = (value: unknown): IRemoteDiagnosticArtifact => {
	const item = asRecord(value);
	const fileType = asString(item.file_type) ?? asString(item.fileType);
	const sizeBytes = asNumber(item.size);
	return {
		id:
			asString(item.filename) ??
			asString(item.file_type) ??
			asString(item.fileType) ??
			'gitlab-artifact',
		name: asString(item.filename) ?? fileType ?? 'artifact',
		kind:
			fileType === 'trace'
				? 'trace'
				: fileType === 'junit' || fileType === 'metadata'
					? 'report'
					: 'archive',
		...(sizeBytes !== undefined ? { sizeBytes } : {}),
	};
};

const mapPipeline = (
	project: IRemoteProjectCoordinates,
	value: unknown,
): IRemoteDiagnosticRunCandidate['run'] => {
	const item = asRecord(value);
	const sha = asString(item.sha);
	const ref = asString(item.ref);
	const branchRef =
		ref === undefined ? undefined : buildBranchRef(project, ref, sha);
	const conclusion = asString(item.status);
	const createdAt = asString(item.created_at);
	const finishedAt = asString(item.updated_at);
	const webUrl = asString(item.web_url);
	return {
		id: asNumber(item.id) ?? asString(item.id) ?? 'unknown-pipeline',
		kind: 'pipeline',
		name: `Pipeline ${String(asNumber(item.id) ?? asString(item.id) ?? '?')}`,
		status: mapStatus(asString(item.status)),
		...(conclusion !== undefined ? { conclusion } : {}),
		...(createdAt !== undefined ? { createdAt } : {}),
		...(finishedAt !== undefined ? { finishedAt } : {}),
		...(sha !== undefined ? { sha } : {}),
		...(branchRef !== undefined ? { ref: branchRef } : {}),
		...(webUrl !== undefined ? { webUrl } : {}),
	};
};

const mapJob = (
	project: IRemoteProjectCoordinates,
	sha: string | undefined,
	ref: string | undefined,
	value: unknown,
): IRemoteDiagnosticJob => {
	const item = asRecord(value);
	const artifacts = Array.isArray(item.artifacts)
		? item.artifacts.map((artifact) => mapArtifact(artifact))
		: [];
	const stage = asString(item.stage);
	const conclusion = asString(item.failure_reason);
	const allowFailure = asBoolean(item.allow_failure);
	const createdAt = asString(item.created_at);
	const startedAt = asString(item.started_at);
	const finishedAt = asString(item.finished_at);
	const webUrl = asString(item.web_url);
	const branchRef =
		ref === undefined ? undefined : buildBranchRef(project, ref, sha);
	return {
		id: asNumber(item.id) ?? asString(item.id) ?? 'unknown-job',
		name: asString(item.name) ?? 'job',
		...(stage !== undefined ? { stage } : {}),
		status: mapStatus(asString(item.status)),
		...(conclusion !== undefined ? { conclusion } : {}),
		...(allowFailure !== undefined ? { allowFailure } : {}),
		...(createdAt !== undefined ? { createdAt } : {}),
		...(startedAt !== undefined ? { startedAt } : {}),
		...(finishedAt !== undefined ? { finishedAt } : {}),
		...(webUrl !== undefined ? { url: webUrl, webUrl } : {}),
		...(branchRef !== undefined ? { ref: branchRef } : {}),
		...(sha !== undefined ? { sha } : {}),
		...(artifacts.length > 0 ? { artifacts } : {}),
	};
};

const mapCommit = (value: unknown): IRemoteDiagnosticCommit => {
	const item = asRecord(value);
	const title = asString(item.title);
	const message = asString(item.message);
	const authorName = asString(item.author_name);
	const authoredAt =
		asString(item.authored_date) ?? asString(item.created_at);
	const url = asString(item.web_url);
	return {
		sha: asString(item.id) ?? 'unknown-sha',
		...(title !== undefined ? { title } : {}),
		...(message !== undefined ? { message } : {}),
		...(authorName !== undefined ? { authorName } : {}),
		...(authoredAt !== undefined ? { authoredAt } : {}),
		...(url !== undefined ? { url } : {}),
	};
};

const mapMergeRequest = (
	project: IRemoteProjectCoordinates,
	value: unknown,
): IRemoteDiagnosticReview => {
	const item = asRecord(value);
	const sourceBranch = asString(item.source_branch);
	const targetBranch = asString(item.target_branch);
	const title = asString(item.title);
	const url = asString(item.web_url);
	const sourceRef =
		sourceBranch === undefined
			? undefined
			: buildBranchRef(project, sourceBranch, asString(item.sha));
	const targetRef =
		targetBranch === undefined
			? undefined
			: buildBranchRef(project, targetBranch, undefined);
	return {
		id: asNumber(item.id) ?? asString(item.id) ?? 'unknown-merge-request',
		number: asNumber(item.iid) ?? asString(item.iid) ?? 'unknown-iid',
		kind: 'merge-request',
		state:
			asString(item.merged_at) !== undefined
				? 'merged'
				: asString(item.state) === 'opened'
					? 'open'
					: asString(item.state) === 'closed'
						? 'closed'
						: asBoolean(item.draft) === true ||
								asBoolean(item.work_in_progress) === true
							? 'draft'
							: 'unknown',
		...(title !== undefined ? { title } : {}),
		...(url !== undefined ? { url } : {}),
		...(sourceRef !== undefined ? { sourceRef } : {}),
		...(targetRef !== undefined ? { targetRef } : {}),
	};
};

const fetchObject = async (
	client: GitLabClient,
	path: string,
	query?: Record<string, string | number | undefined>,
): Promise<IRemoteProviderSuccess<Record<string, unknown>>> =>
	client.request({
		path,
		...(query !== undefined ? { query } : {}),
		responseSchema: objectSchema,
	});

const fetchArray = async (
	client: GitLabClient,
	path: string,
	query?: Record<string, string | number | undefined>,
): Promise<IRemoteProviderSuccess<readonly Record<string, unknown>[]>> =>
	client.request({
		path,
		...(query !== undefined ? { query } : {}),
		responseSchema: arraySchema,
	});

const fetchText = async (
	client: GitLabClient,
	path: string,
): Promise<IRemoteProviderSuccess<string>> =>
	client.request({ path, parseAs: 'text' });

const resolveProjectRef = (project: IRemoteProjectCoordinates): string => {
	if (project.projectId !== undefined)
		return encodeURIComponent(String(project.projectId));
	if (project.projectPath !== undefined)
		return encodeURIComponent(project.projectPath);
	throw new Error(
		'GitLab diagnostics could not resolve the project reference.',
	);
};

const isRelevantJob = (job: IRemoteDiagnosticJob): boolean =>
	RELEVANT_JOB_STATUSES.has(job.status) || (job.artifacts?.length ?? 0) > 0;

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
		Math.max(
			toMillis(right.finishedAt),
			toMillis(right.startedAt),
			toMillis(right.createdAt),
		) -
		Math.max(
			toMillis(left.finishedAt),
			toMillis(left.startedAt),
			toMillis(left.createdAt),
		)
	);
};

export const diagnoseGitLabPipeline = async (
	options: IGitLabPipelineDiagnosticOptions,
	input: IGitLabPipelineDiagnosticInput,
): Promise<IRemoteDiagnosticResult> => {
	const project = resolveProject(options.context, input);
	const projectRef = resolveProjectRef(project);
	const limits = {
		...DEFAULT_REMOTE_DIAGNOSTIC_LIMITS,
		...input.limits,
	};

	const reviewPromise =
		input.mergeRequestIid === undefined
			? Promise.resolve<IRemoteDiagnosticReview | undefined>(undefined)
			: attempt(
					fetchObject(
						options.client,
						`/projects/${projectRef}/merge_requests/${String(input.mergeRequestIid)}`,
					),
					'GitLab merge request lookup failed',
				).then((result) =>
					result.ok
						? mapMergeRequest(project, result.value.data)
						: undefined,
				);

	const selectedRun =
		await (async (): Promise<IRemoteDiagnosticRunCandidate | null> => {
			if (input.pipelineId !== undefined) {
				const [pipelineResult, jobsResult] = await Promise.all([
					fetchObject(
						options.client,
						`/projects/${projectRef}/pipelines/${String(input.pipelineId)}`,
					),
					attempt(
						fetchArray(
							options.client,
							`/projects/${projectRef}/pipelines/${String(input.pipelineId)}/jobs`,
							{ per_page: 100, page: 1 },
						),
						'GitLab pipeline jobs lookup failed',
					),
				]);
				const run = mapPipeline(project, pipelineResult.data);
				const refName = run.ref?.name;
				const jobs = jobsResult.ok
					? jobsResult.value.data.map((job) =>
							mapJob(project, run.sha, refName, job),
						)
					: [];
				const candidateErrors: IRemoteProviderError[] = [];
				if (!jobsResult.ok) candidateErrors.push(jobsResult.error);

				const logTargets = jobs
					.filter((job) => isRelevantJob(job))
					.sort(compareTimestampDesc)
					.slice(0, limits.maxRelevantJobs);
				const logsByJob = new Map<
					IRemoteDiagnosticJob['id'],
					IRemoteDiagnosticJob['log']
				>();
				const logResults = await Promise.all(
					logTargets.map(async (job) => {
						const startedAt = Date.now();
						const result = await attempt(
							fetchText(
								options.client,
								`/projects/${projectRef}/jobs/${String(job.id)}/trace`,
							),
							'GitLab job trace lookup failed',
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

				return {
					run,
					jobs: jobs.map((job) => ({
						...job,
						...(logsByJob.has(job.id)
							? { log: logsByJob.get(job.id) ?? null }
							: {}),
					})),
					artifacts: jobs.flatMap((job) => job.artifacts ?? []),
					...(candidateErrors.length > 0
						? { errors: candidateErrors, partial: true }
						: {}),
				};
			}

			const pipelinesResult = await fetchArray(
				options.client,
				`/projects/${projectRef}/pipelines`,
				{
					per_page: Math.max(10, limits.maxRelevantJobs),
					page: 1,
					...(input.ref !== undefined ? { ref: input.ref } : {}),
					...(input.status !== undefined
						? { status: input.status }
						: {}),
				},
			);
			const latest = pipelinesResult.data[0];
			if (latest === undefined) return null;
			const summary = mapPipeline(project, latest);
			return {
				run: summary,
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
						`/projects/${projectRef}/repository/commits/${encodeURIComponent(resolvedSha)}`,
						{ with_stats: 1 },
					),
					'GitLab commit lookup failed',
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
		provider: 'gitlab',
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
