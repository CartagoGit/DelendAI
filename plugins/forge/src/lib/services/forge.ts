import { runExternalTool, type IExternalTool } from '@mcp-vertex/core/public';

import type {
	IForgeCheck,
	IForgeCiStatusResult,
	IForgeCiSummary,
	IForgeCommands,
	IForgeExec,
	IForgeFailure,
	IForgeIssueComment,
	IForgeIssueDetail,
	IForgeIssueListResult,
	IForgeIssueShowResult,
	IForgeIssueSummary,
	IMutableForgeCiSummary,
	IForgePrListResult,
	IForgePrShowResult,
	IForgeProvider,
	IForgeProviderResult,
	IForgePullRequestDetail,
	IForgePullRequestSummary,
	IForgeRunResult,
	IForgeWorkflowJob,
	IForgeWorkflowRun,
} from '../contracts/interfaces/forge-read.interface';

const GIT_TOOL: IExternalTool = {
	id: 'git',
	bin: 'git',
	installHints: [
		{ manager: 'brew', command: 'brew install git' },
		{ manager: 'apt', command: 'sudo apt install git' },
	],
};

const GH_TOOL: IExternalTool = {
	id: 'gh',
	bin: 'gh',
	installHints: [
		{ manager: 'brew', command: 'brew install gh' },
		{ manager: 'apt', command: 'sudo apt install gh' },
		{ manager: 'winget', command: 'winget install GitHub.cli' },
	],
};

const GLAB_TOOL: IExternalTool = {
	id: 'glab',
	bin: 'glab',
	installHints: [
		{ manager: 'brew', command: 'brew install glab' },
		{ manager: 'apt', command: 'sudo apt install glab' },
		{ manager: 'winget', command: 'winget install glab.glab' },
	],
};

const emptyCiSummary = (): IForgeCiSummary => ({
	total: 0,
	successful: 0,
	failed: 0,
	pending: 0,
	running: 0,
});

const installRemediation = (tool: IExternalTool): string | undefined =>
	tool.installHints?.[0]?.command;

const failure = (
	reason: string,
	provider?: IForgeProvider,
	tool?: IExternalTool,
): IForgeFailure => ({
	ok: false,
	...(provider !== undefined ? { provider } : {}),
	error:
		tool !== undefined && installRemediation(tool) !== undefined
			? { reason, remediation: installRemediation(tool) as string }
			: { reason },
});

const trimOrFallback = (value: unknown, fallback = ''): string => {
	if (typeof value !== 'string') return fallback;
	const trimmed = value.trim();
	return trimmed === '' ? fallback : trimmed;
};

const toStringValue = (value: unknown, fallback = ''): string => {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	return fallback;
};

const toNumberValue = (value: unknown): number => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const toRecordArray = (value: unknown): readonly Record<string, unknown>[] =>
	Array.isArray(value)
		? value
				.map((entry) => toRecord(entry))
				.filter(
					(entry): entry is Record<string, unknown> =>
						entry !== undefined,
				)
		: [];

const labelNames = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value
				.map((entry) => {
					if (typeof entry === 'string') return entry.trim();
					const record = toRecord(entry);
					return trimOrFallback(
						record?.name ?? record?.title ?? record?.label,
					);
				})
				.filter((entry) => entry !== '')
		: [];

const authorName = (value: unknown): string => {
	if (typeof value === 'string') return value;
	const record = toRecord(value);
	if (record === undefined) return '';
	return trimOrFallback(
		record.login ?? record.username ?? record.name ?? record.author,
	);
};

const sliceJson = (raw: string): string | undefined => {
	const trimmed = raw.trim();
	if (trimmed === '') return undefined;
	const arrayStart = trimmed.indexOf('[');
	const objectStart = trimmed.indexOf('{');
	const hasArray = arrayStart >= 0;
	const hasObject = objectStart >= 0;
	if (!hasArray && !hasObject) return undefined;
	const start =
		hasArray && hasObject
			? Math.min(arrayStart, objectStart)
			: hasArray
				? arrayStart
				: objectStart;
	const open = trimmed[start];
	const close = open === '[' ? ']' : '}';
	const end = trimmed.lastIndexOf(close);
	return end >= start ? trimmed.slice(start, end + 1) : undefined;
};

const parseJson = (raw: string): unknown => {
	const json = sliceJson(raw);
	if (json === undefined) return undefined;
	try {
		return JSON.parse(json);
	} catch {
		return undefined;
	}
};

const isJsonLike = (raw: string): boolean => {
	const trimmed = raw.trim();
	return trimmed.startsWith('{') || trimmed.startsWith('[');
};

const normaliseStatus = (status: string, conclusion: string) => {
	const upperStatus = status.toUpperCase();
	const upperConclusion = conclusion.toUpperCase();
	if (
		upperConclusion === 'SUCCESS' ||
		upperStatus === 'SUCCESS' ||
		upperStatus === 'PASSED'
	) {
		return 'successful' as const;
	}
	if (
		['FAILURE', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'ERROR'].includes(
			upperConclusion,
		) ||
		['FAILURE', 'FAILED', 'CANCELLED', 'ERROR'].includes(upperStatus)
	) {
		return 'failed' as const;
	}
	if (['IN_PROGRESS', 'RUNNING'].includes(upperStatus)) {
		return 'running' as const;
	}
	return 'pending' as const;
};

const ciSummaryFromChecks = (
	checks: readonly IForgeCheck[],
): IForgeCiSummary => {
	const summary: IMutableForgeCiSummary = { ...emptyCiSummary() };
	for (const check of checks) {
		summary.total += 1;
		summary[normaliseStatus(check.status, check.conclusion)] += 1;
	}
	return summary;
};

const ciSummaryFromPipelineStatus = (status: string): IForgeCiSummary => {
	if (status.trim() === '') return emptyCiSummary();
	const summary: IMutableForgeCiSummary = { ...emptyCiSummary() };
	summary.total = 1;
	summary[normaliseStatus(status, status)] = 1;
	return summary;
};

const parseChecks = (
	provider: IForgeProvider,
	value: unknown,
): readonly IForgeCheck[] => {
	if (provider === 'gitlab') {
		const pipeline = toRecord(value);
		if (pipeline === undefined) return [];
		const status = trimOrFallback(pipeline.status);
		if (status === '') return [];
		return [
			{
				name: trimOrFallback(pipeline.name, 'pipeline'),
				status,
				conclusion: status,
				url: trimOrFallback(pipeline.web_url ?? pipeline.details_url),
			},
		];
	}
	return toRecordArray(value).map((entry) => ({
		name: trimOrFallback(entry.name ?? entry.context),
		status: trimOrFallback(entry.status ?? entry.state),
		conclusion: trimOrFallback(entry.conclusion),
		url: trimOrFallback(entry.detailsUrl ?? entry.targetUrl),
	}));
};

const parsePrListPayload = (
	provider: IForgeProvider,
	raw: string,
): readonly IForgePullRequestSummary[] => {
	const parsed = parseJson(raw);
	return toRecordArray(parsed).map((entry) => {
		const checks =
			provider === 'github'
				? parseChecks(provider, entry.statusCheckRollup)
				: parseChecks(
						provider,
						entry.head_pipeline ??
							entry.pipeline ??
							entry.latest_pipeline,
					);
		return {
			number: toNumberValue(entry.number ?? entry.iid),
			title: toStringValue(entry.title),
			branch: toStringValue(entry.headRefName ?? entry.source_branch),
			url: toStringValue(entry.url ?? entry.web_url),
			draft:
				entry.isDraft === true ||
				entry.draft === true ||
				entry.work_in_progress === true,
			author: authorName(entry.author),
			labels: labelNames(entry.labels),
			ciSummary:
				checks.length > 0
					? ciSummaryFromChecks(checks)
					: ciSummaryFromPipelineStatus(
							trimOrFallback(
								toRecord(
									entry.head_pipeline ??
										entry.pipeline ??
										entry.latest_pipeline,
								)?.status,
							),
						),
		};
	});
};

const parsePrDetailPayload = (
	provider: IForgeProvider,
	raw: string,
): IForgePullRequestDetail | undefined => {
	const parsed = toRecord(parseJson(raw));
	if (parsed === undefined) return undefined;
	const checks =
		provider === 'github'
			? parseChecks(provider, parsed.statusCheckRollup)
			: parseChecks(
					provider,
					parsed.head_pipeline ??
						parsed.pipeline ??
						parsed.latest_pipeline,
				);
	return {
		number: toNumberValue(parsed.number ?? parsed.iid),
		title: toStringValue(parsed.title),
		branch: toStringValue(parsed.headRefName ?? parsed.source_branch),
		url: toStringValue(parsed.url ?? parsed.web_url),
		draft:
			parsed.isDraft === true ||
			parsed.draft === true ||
			parsed.work_in_progress === true,
		author: authorName(parsed.author),
		labels: labelNames(parsed.labels),
		ciSummary:
			checks.length > 0
				? ciSummaryFromChecks(checks)
				: ciSummaryFromPipelineStatus(
						trimOrFallback(
							toRecord(
								parsed.head_pipeline ??
									parsed.pipeline ??
									parsed.latest_pipeline,
							)?.status,
						),
					),
		state: toStringValue(parsed.state),
		mergeable: toStringValue(
			parsed.mergeable ??
				parsed.merge_status ??
				parsed.detailed_merge_status,
		),
		reviewDecision: toStringValue(
			parsed.reviewDecision ?? parsed.review_decision,
		),
		checks,
	};
};

const parseIssueListPayload = (raw: string): readonly IForgeIssueSummary[] => {
	const parsed = parseJson(raw);
	return toRecordArray(parsed).map((entry) => ({
		number: toNumberValue(entry.number ?? entry.iid),
		title: toStringValue(entry.title),
		state: toStringValue(entry.state),
		url: toStringValue(entry.url ?? entry.web_url),
		author: authorName(entry.author),
		labels: labelNames(entry.labels),
	}));
};

const parseIssueComments = (value: unknown): readonly IForgeIssueComment[] =>
	toRecordArray(value).map((entry) => ({
		author: authorName(entry.author),
		body: toStringValue(entry.body ?? entry.bodyText ?? entry.note),
		...(trimOrFallback(entry.createdAt ?? entry.created_at) !== ''
			? { createdAt: trimOrFallback(entry.createdAt ?? entry.created_at) }
			: {}),
		...(trimOrFallback(entry.url ?? entry.web_url) !== ''
			? { url: trimOrFallback(entry.url ?? entry.web_url) }
			: {}),
	}));

const parseIssueDetailPayload = (
	raw: string,
): IForgeIssueDetail | undefined => {
	const parsed = toRecord(parseJson(raw));
	if (parsed === undefined) return undefined;
	return {
		number: toNumberValue(parsed.number ?? parsed.iid),
		title: toStringValue(parsed.title),
		state: toStringValue(parsed.state),
		url: toStringValue(parsed.url ?? parsed.web_url),
		author: authorName(parsed.author),
		labels: labelNames(parsed.labels),
		body: toStringValue(parsed.body ?? parsed.description),
		comments: parseIssueComments(parsed.comments ?? parsed.notes),
	};
};

const parseCiListPayload = (raw: string): readonly IForgeWorkflowRun[] => {
	const parsed = parseJson(raw);
	return toRecordArray(parsed).map((entry) => ({
		id: toStringValue(entry.databaseId ?? entry.id ?? entry.iid),
		name: toStringValue(entry.displayTitle ?? entry.name ?? entry.title),
		workflow: toStringValue(entry.workflowName ?? entry.ref ?? entry.name),
		branch: toStringValue(entry.headBranch ?? entry.ref),
		status: toStringValue(entry.status),
		conclusion: toStringValue(entry.conclusion ?? entry.status),
		url: toStringValue(entry.url ?? entry.web_url),
		...(trimOrFallback(entry.createdAt ?? entry.created_at) !== ''
			? { createdAt: trimOrFallback(entry.createdAt ?? entry.created_at) }
			: {}),
		...(trimOrFallback(entry.updatedAt ?? entry.updated_at) !== ''
			? { updatedAt: trimOrFallback(entry.updatedAt ?? entry.updated_at) }
			: {}),
		jobs: [],
	}));
};

const parseWorkflowJobs = (raw: string): readonly IForgeWorkflowJob[] => {
	const parsed = parseJson(raw);
	const record = toRecord(parsed);
	if (record !== undefined) {
		return toRecordArray(record.jobs).map((entry) => ({
			id: toStringValue(entry.databaseId ?? entry.id),
			name: toStringValue(entry.name ?? entry.stage),
			status: toStringValue(entry.status),
			conclusion: toStringValue(entry.conclusion ?? entry.status),
			...(trimOrFallback(entry.startedAt ?? entry.started_at) !== ''
				? {
						startedAt: trimOrFallback(
							entry.startedAt ?? entry.started_at,
						),
					}
				: {}),
			...(trimOrFallback(entry.completedAt ?? entry.finished_at) !== ''
				? {
						completedAt: trimOrFallback(
							entry.completedAt ?? entry.finished_at,
						),
					}
				: {}),
			...(trimOrFallback(entry.url ?? entry.web_url) !== ''
				? { url: trimOrFallback(entry.url ?? entry.web_url) }
				: {}),
		}));
	}
	return toRecordArray(parsed).map((entry) => ({
		id: toStringValue(entry.id),
		name: toStringValue(entry.name ?? entry.stage),
		status: toStringValue(entry.status),
		conclusion: toStringValue(entry.conclusion ?? entry.status),
		...(trimOrFallback(entry.started_at) !== ''
			? { startedAt: trimOrFallback(entry.started_at) }
			: {}),
		...(trimOrFallback(entry.finished_at) !== ''
			? { completedAt: trimOrFallback(entry.finished_at) }
			: {}),
		...(trimOrFallback(entry.web_url) !== ''
			? { url: trimOrFallback(entry.web_url) }
			: {}),
	}));
};

const buildAuthRemediation = (provider: IForgeProvider): string =>
	provider === 'github'
		? 'Run gh auth login and retry.'
		: 'Run glab auth login and retry.';

const readRemoteHost = (remoteUrl: string): string | undefined => {
	const sshMatch = /^git@([^:]+):/.exec(remoteUrl);
	if (sshMatch?.[1] !== undefined) return sshMatch[1].toLowerCase();
	try {
		return new URL(remoteUrl).hostname.toLowerCase();
	} catch {
		return undefined;
	}
};

export const detectForgeProvider = async (
	cwd: string,
	exec: IForgeExec = runExternalTool,
): Promise<IForgeProviderResult> => {
	const remote = await exec({
		tool: GIT_TOOL,
		args: ['remote', 'get-url', 'origin'],
		cwd,
	});
	if (remote.unavailable)
		return failure('git is not available on PATH', undefined, GIT_TOOL);
	if (!remote.ok) {
		return failure(
			trimOrFallback(
				remote.stderr,
				'Could not read the origin remote for this repository.',
			),
		);
	}
	const remoteUrl = trimOrFallback(remote.stdout);
	if (remoteUrl === '')
		return failure('The origin remote is empty or missing.');
	const remoteHost = readRemoteHost(remoteUrl);
	if (remoteHost === undefined)
		return failure('Could not parse the origin remote URL.');
	if (remoteHost === 'github.com') {
		return {
			ok: true,
			provider: 'github',
			tool: GH_TOOL,
			remoteUrl,
			remoteHost,
		};
	}
	if (remoteHost === 'gitlab.com') {
		return {
			ok: true,
			provider: 'gitlab',
			tool: GLAB_TOOL,
			remoteUrl,
			remoteHost,
		};
	}
	return failure(
		`Unsupported forge provider for origin remote host: ${remoteHost}`,
	);
};

export const runForge = async (
	cwd: string,
	commands: IForgeCommands,
	exec: IForgeExec = runExternalTool,
): Promise<IForgeRunResult> => {
	const provider = await detectForgeProvider(cwd, exec);
	if (!provider.ok) return provider;
	const args =
		provider.provider === 'github' ? commands.github : commands.gitlab;
	const run = await exec({ tool: provider.tool, args, cwd });
	if (run.unavailable) {
		return failure(
			`${provider.tool.bin} is not available on PATH`,
			provider.provider,
			provider.tool,
		);
	}
	const payload = trimOrFallback(run.stdout, run.stderr);
	if (!run.ok && !isJsonLike(payload)) {
		return {
			ok: false,
			provider: provider.provider,
			error: {
				reason: trimOrFallback(
					run.stderr,
					`${provider.tool.bin} ${args.join(' ')} failed`,
				),
				remediation: buildAuthRemediation(provider.provider),
			},
		};
	}
	return {
		ok: true,
		provider: provider.provider,
		tool: provider.tool,
		stdout: run.stdout,
		stderr: run.stderr,
	};
};

const issueStateFor = (
	provider: IForgeProvider,
	state: 'open' | 'closed' | 'all',
) =>
	provider === 'gitlab'
		? state === 'open'
			? 'opened'
			: state === 'closed'
				? 'closed'
				: 'all'
		: state;

export const listPullRequests = async (
	cwd: string,
	exec: IForgeExec = runExternalTool,
): Promise<IForgePrListResult> => {
	const run = await runForge(
		cwd,
		{
			github: [
				'pr',
				'list',
				'--state',
				'open',
				'--limit',
				'50',
				'--json',
				'number,title,headRefName,url,isDraft,author,labels,statusCheckRollup',
			],
			gitlab: [
				'mr',
				'list',
				'--state',
				'opened',
				'--per-page',
				'50',
				'--output',
				'json',
			],
		},
		exec,
	);
	if (!run.ok) return run;
	return {
		ok: true,
		provider: run.provider,
		data: {
			prs: parsePrListPayload(run.provider, run.stdout || run.stderr),
		},
	};
};

export const showPullRequest = async (
	cwd: string,
	pr?: string,
	exec: IForgeExec = runExternalTool,
): Promise<IForgePrShowResult> => {
	const run = await runForge(
		cwd,
		{
			github: [
				'pr',
				'view',
				...(pr !== undefined && pr !== '' ? [pr] : []),
				'--json',
				'number,title,state,url,headRefName,isDraft,author,labels,mergeable,reviewDecision,statusCheckRollup',
			],
			gitlab: [
				'mr',
				'view',
				...(pr !== undefined && pr !== '' ? [pr] : []),
				'--output',
				'json',
			],
		},
		exec,
	);
	if (!run.ok) return run;
	const detail = parsePrDetailPayload(run.provider, run.stdout || run.stderr);
	return detail === undefined
		? failure(
				'Could not parse the forge pull request payload.',
				run.provider,
			)
		: { ok: true, provider: run.provider, data: { pr: detail } };
};

const buildRunDetailArgs = (
	provider: IForgeProvider,
	runId: string,
): readonly string[] =>
	provider === 'github'
		? ['run', 'view', runId, '--json', 'jobs,url']
		: ['ci', 'view', runId, '--output', 'json'];

const buildFailingLogArgs = (
	provider: IForgeProvider,
	runId: string,
	jobId?: string,
): readonly string[] | undefined => {
	if (provider === 'github') return ['run', 'view', runId, '--log-failed'];
	return jobId !== undefined && jobId !== ''
		? ['ci', 'trace', jobId]
		: undefined;
};

export const getCiStatus = async (
	cwd: string,
	limit = 10,
	exec: IForgeExec = runExternalTool,
): Promise<IForgeCiStatusResult> => {
	const run = await runForge(
		cwd,
		{
			github: [
				'run',
				'list',
				'--limit',
				String(limit),
				'--json',
				'databaseId,displayTitle,headBranch,status,conclusion,url,workflowName,createdAt,updatedAt',
			],
			gitlab: [
				'ci',
				'list',
				'--per-page',
				String(limit),
				'--output',
				'json',
			],
		},
		exec,
	);
	if (!run.ok) return run;
	const runs = parseCiListPayload(run.stdout || run.stderr);
	const hydrated: IForgeWorkflowRun[] = [];
	for (const item of runs) {
		const detailRun = await exec({
			tool: run.tool,
			args: buildRunDetailArgs(run.provider, item.id),
			cwd,
		});
		const jobs = detailRun.ok
			? parseWorkflowJobs(detailRun.stdout || detailRun.stderr)
			: [];
		const failedJob = jobs.find((job) =>
			['FAILURE', 'FAILED', 'ERROR'].includes(
				job.conclusion.toUpperCase(),
			),
		);
		const logArgs = buildFailingLogArgs(
			run.provider,
			item.id,
			failedJob?.id,
		);
		const failingLogRun =
			logArgs === undefined
				? undefined
				: await exec({
						tool: run.tool,
						args: logArgs,
						cwd,
						maxOutputBytes: 64 * 1024,
					});
		hydrated.push({
			...item,
			jobs,
			...(failingLogRun?.ok === true &&
			trimOrFallback(failingLogRun.stdout) !== ''
				? { failingLog: trimOrFallback(failingLogRun.stdout) }
				: {}),
		});
	}
	return { ok: true, provider: run.provider, data: { runs: hydrated } };
};

export const listIssues = async (
	cwd: string,
	state: 'open' | 'closed' | 'all' = 'open',
	limit = 50,
	exec: IForgeExec = runExternalTool,
): Promise<IForgeIssueListResult> => {
	const run = await runForge(
		cwd,
		{
			github: [
				'issue',
				'list',
				'--state',
				issueStateFor('github', state),
				'--limit',
				String(limit),
				'--json',
				'number,title,state,url,author,labels',
			],
			gitlab: [
				'issue',
				'list',
				'--state',
				issueStateFor('gitlab', state),
				'--per-page',
				String(limit),
				'--output',
				'json',
			],
		},
		exec,
	);
	if (!run.ok) return run;
	return {
		ok: true,
		provider: run.provider,
		data: { issues: parseIssueListPayload(run.stdout || run.stderr) },
	};
};

export const showIssue = async (
	cwd: string,
	issue: string,
	exec: IForgeExec = runExternalTool,
): Promise<IForgeIssueShowResult> => {
	const run = await runForge(
		cwd,
		{
			github: [
				'issue',
				'view',
				issue,
				'--json',
				'number,title,state,url,author,labels,body,comments',
			],
			gitlab: ['issue', 'view', issue, '--output', 'json'],
		},
		exec,
	);
	if (!run.ok) return run;
	const detail = parseIssueDetailPayload(run.stdout || run.stderr);
	return detail === undefined
		? failure('Could not parse the forge issue payload.', run.provider)
		: { ok: true, provider: run.provider, data: { issue: detail } };
};
