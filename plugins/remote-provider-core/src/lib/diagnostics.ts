import type {
	IRemoteDiagnosedJob,
	IRemoteDiagnosticArtifact,
	IRemoteDiagnosticCommit,
	IRemoteDiagnosticCorrelation,
	IRemoteDiagnosticInput,
	IRemoteDiagnosticLimits,
	IRemoteDiagnosticLogCapture,
	IRemoteDiagnosticLogEvidence,
	IRemoteDiagnosticReport,
	IRemoteDiagnosticResourceInput,
	IRemoteDiagnosticReview,
	IRemoteDiagnosticResult,
	IRemoteDiagnosticRun,
	IRemoteDiagnosticRunCandidate,
	IRemoteDiagnosticSubjectEvidence,
	IRemoteProjectCoordinates,
	IRemoteResolvedDiagnosticResource,
	IRemoteSelectedDiagnosticRun,
	IRemoteTruncationInfo,
	RemoteDiagnosticConfidence,
	RemoteDiagnosticEvidenceAvailability,
	RemoteDiagnosticExecutionStatus,
	RemoteProviderId,
} from '@delendai/contracts/remote-diagnostics';
import type {
	IRemoteGitRef,
	IRemoteProviderError,
} from '@delendai/contracts/remote-provider';

import { applyByteLimit, applyLineLimit } from './limits';

export const DEFAULT_REMOTE_DIAGNOSTIC_LIMITS: IRemoteDiagnosticLimits = {
	maxLogBytes: 32_000,
	maxLogLines: 200,
	maxLogDurationMs: 5_000,
	maxRelevantJobs: 10,
	maxExcerptLines: 4,
};

const FAILED_STATUSES = new Set<RemoteDiagnosticExecutionStatus>([
	'failed',
	'canceled',
	'timed-out',
]);

const RELEVANT_STATUSES = new Set<RemoteDiagnosticExecutionStatus>([
	'failed',
	'canceled',
	'timed-out',
	'queued',
	'running',
]);

const ERROR_LINE =
	/(error|failed|failure|exception|traceback|fatal|panic|timeout|timed out)/i;

const toTimestamp = (value: string | undefined): number => {
	if (value === undefined) return 0;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const compareDesc = (left: number, right: number): number => right - left;

const latestRunTimestamp = (candidate: IRemoteDiagnosticRunCandidate): number =>
	Math.max(
		toTimestamp(candidate.run.finishedAt),
		toTimestamp(candidate.run.startedAt),
		toTimestamp(candidate.run.createdAt),
	);

const normalizeRefName = (
	ref: IRemoteGitRef | undefined | null,
): string | null => {
	if (ref?.fullName !== undefined && ref.fullName.length > 0)
		return ref.fullName;
	if (ref?.name !== undefined && ref.name.length > 0) return ref.name;
	return null;
};

const isShaMatch = (
	left: string | undefined,
	right: string | undefined,
): boolean | null => {
	if (left === undefined || right === undefined) return null;
	const normalizedLeft = left.toLowerCase();
	const normalizedRight = right.toLowerCase();
	return (
		normalizedLeft === normalizedRight ||
		normalizedLeft.startsWith(normalizedRight) ||
		normalizedRight.startsWith(normalizedLeft)
	);
};

const isRefMatch = (
	left: IRemoteGitRef | undefined | null,
	right: IRemoteGitRef | undefined | null,
): boolean | null => {
	const leftName = normalizeRefName(left);
	const rightName = normalizeRefName(right);
	if (leftName === null || rightName === null) return null;
	return leftName === rightName;
};

const dedupeArtifacts = (
	artifacts: readonly IRemoteDiagnosticArtifact[],
): readonly IRemoteDiagnosticArtifact[] => {
	const seen = new Set<string>();
	const result: IRemoteDiagnosticArtifact[] = [];
	for (const artifact of artifacts) {
		const key = [
			artifact.id,
			artifact.name,
			artifact.downloadUrl ?? artifact.url ?? '',
		].join('::');
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(artifact);
	}
	return result;
};

const mergeTruncation = (
	infos: readonly (IRemoteTruncationInfo | null | undefined)[],
): IRemoteTruncationInfo | null => {
	const truncatedInfos = infos.filter(
		(info): info is IRemoteTruncationInfo => info?.truncated === true,
	);
	if (truncatedInfos.length === 0) return null;
	const priorities: readonly NonNullable<IRemoteTruncationInfo['reason']>[] =
		['time-limit', 'byte-limit', 'line-limit', 'server-limit'];
	const reason =
		priorities.find((candidate) =>
			truncatedInfos.some((info) => info.reason === candidate),
		) ?? 'server-limit';
	return {
		truncated: true,
		reason,
		originalBytes:
			truncatedInfos.find((info) => info.originalBytes !== null)
				?.originalBytes ?? null,
		keptBytes:
			truncatedInfos.find((info) => info.keptBytes !== null)?.keptBytes ??
			null,
		originalLines:
			truncatedInfos.find((info) => info.originalLines !== null)
				?.originalLines ?? null,
		keptLines:
			truncatedInfos.find((info) => info.keptLines !== null)?.keptLines ??
			null,
	};
};

const buildTimeLimitTruncation = (
	durationMs: number | undefined,
	maxLogDurationMs: number,
	error: IRemoteProviderError | undefined,
): IRemoteTruncationInfo | null => {
	if (error?.code === 'timeout') {
		return {
			truncated: true,
			reason: 'time-limit',
			originalBytes: null,
			keptBytes: null,
			originalLines: null,
			keptLines: null,
		};
	}
	if (durationMs === undefined || durationMs <= maxLogDurationMs) return null;
	return {
		truncated: true,
		reason: 'time-limit',
		originalBytes: null,
		keptBytes: null,
		originalLines: null,
		keptLines: null,
	};
};

const extractExcerptLines = (
	text: string,
	maxExcerptLines: number,
): readonly string[] => {
	const lines = text
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const matching = lines.filter((line) => ERROR_LINE.test(line));
	const source = matching.length > 0 ? matching : lines;
	return source.slice(Math.max(0, source.length - maxExcerptLines));
};

const buildAvailability = (input: {
	readonly hasValue: boolean;
	readonly notes?: readonly string[];
	readonly errors?: readonly IRemoteProviderError[];
	readonly truncated?: IRemoteTruncationInfo | null;
}): RemoteDiagnosticEvidenceAvailability => {
	const notes = input.notes ?? [];
	const errors = input.errors ?? [];
	const truncated = input.truncated ?? null;
	if (!input.hasValue) {
		return notes.length > 0 || errors.length > 0 || truncated !== null
			? 'partial'
			: 'unavailable';
	}
	if (notes.length > 0 || errors.length > 0 || truncated !== null)
		return 'partial';
	return 'complete';
};

const evidenceOf = <T>(input: {
	readonly value: T | null;
	readonly notes?: readonly string[];
	readonly errors?: readonly IRemoteProviderError[];
	readonly truncated?: IRemoteTruncationInfo | null;
}): IRemoteDiagnosticSubjectEvidence<T> => {
	const notes = [...(input.notes ?? [])];
	const errors = [...(input.errors ?? [])];
	const truncated = input.truncated ?? null;
	return {
		availability: buildAvailability({
			hasValue: input.value !== null,
			notes,
			errors,
			truncated,
		}),
		value: input.value,
		notes,
		errors,
		truncated,
	};
};

const resolveResourceIdentifier = (
	project: IRemoteProjectCoordinates,
	provider: RemoteProviderId,
): string => {
	if (project.displayName !== undefined && project.displayName.length > 0) {
		return project.displayName;
	}
	if (
		project.owner !== undefined &&
		project.repository !== undefined &&
		project.owner.length > 0 &&
		project.repository.length > 0
	) {
		return `${project.owner}/${project.repository}`;
	}
	if (project.projectPath !== undefined && project.projectPath.length > 0) {
		return project.projectPath;
	}
	if (project.projectId !== undefined) return String(project.projectId);
	return `${provider}:${project.host}`;
};

const correlationFor = (input: {
	readonly resource: IRemoteDiagnosticResourceInput;
	readonly run: Pick<IRemoteDiagnosticRun, 'sha' | 'ref'>;
	readonly job?:
		| Pick<IRemoteDiagnosedJob, 'sha' | 'ref'>
		| Pick<IRemoteDiagnosticRun, 'sha' | 'ref'>;
}): IRemoteDiagnosticCorrelation => {
	const target = input.job ?? input.run;
	const commitMatches = isShaMatch(input.resource.commit?.sha, target.sha);
	const refMatches = isRefMatch(input.resource.ref, target.ref);
	const reviewMatches =
		isShaMatch(input.resource.review?.headSha, target.sha) ??
		isRefMatch(input.resource.review?.sourceRef, target.ref);
	const notes: string[] = [];
	if (commitMatches === false)
		notes.push('run sha does not match the requested commit');
	if (refMatches === false)
		notes.push('run ref does not match the requested ref');
	if (reviewMatches === false)
		notes.push('run does not align with the requested review head');
	return {
		commitMatches,
		refMatches,
		reviewMatches,
		notes,
	};
};

const resolveCommitEvidence = (
	resource: IRemoteDiagnosticResourceInput,
	run: IRemoteDiagnosticRun | null,
): IRemoteDiagnosticSubjectEvidence<IRemoteDiagnosticCommit> => {
	const notes: string[] = [];
	let commit = resource.commit ?? null;
	if (commit === null && run?.sha !== undefined) {
		commit = { sha: run.sha };
		notes.push('commit metadata fell back to the selected run sha');
	}
	return evidenceOf({ value: commit, notes });
};

const resolveRefEvidence = (
	resource: IRemoteDiagnosticResourceInput,
	run: IRemoteDiagnosticRun | null,
): IRemoteDiagnosticSubjectEvidence<IRemoteGitRef> => {
	const notes: string[] = [];
	const ref = resource.ref ?? run?.ref ?? null;
	if (resource.ref === undefined && run?.ref !== undefined) {
		notes.push('ref metadata fell back to the selected run ref');
	}
	return evidenceOf({ value: ref, notes });
};

const processLog = (
	log: IRemoteDiagnosticLogCapture | null | undefined,
	limits: IRemoteDiagnosticLimits,
): IRemoteDiagnosticLogEvidence | null => {
	if (log === null || log === undefined) return null;
	const notes: string[] = [];
	const errors = log.error === undefined ? [] : [log.error];
	const timeTruncation = buildTimeLimitTruncation(
		log.durationMs,
		limits.maxLogDurationMs,
		log.error,
	);
	if (timeTruncation !== null) notes.push('log capture hit the time limit');
	const inheritedTruncation = mergeTruncation([
		log.truncation,
		timeTruncation,
	]);
	if (log.text === undefined) {
		return {
			availability: buildAvailability({
				hasValue: false,
				notes,
				errors,
				truncated: inheritedTruncation,
			}),
			text: null,
			excerptLines: [],
			url: log.url ?? null,
			durationMs: log.durationMs ?? null,
			truncated: inheritedTruncation,
			notes,
			errors,
		};
	}

	const byteLimited = applyByteLimit(log.text, limits.maxLogBytes);
	const lineLimited = applyLineLimit(
		byteLimited.text.split(/\r?\n/u),
		limits.maxLogLines,
	);
	if (byteLimited.truncation.truncated) {
		notes.push('log output was truncated by byte limit');
	}
	if (lineLimited.truncation.truncated) {
		notes.push('log output was truncated by line limit');
	}
	const text = lineLimited.lines.join('\n');
	const truncated = mergeTruncation([
		log.truncation,
		timeTruncation,
		byteLimited.truncation,
		lineLimited.truncation,
	]);
	return {
		availability: buildAvailability({
			hasValue: text.length > 0,
			notes,
			errors,
			truncated,
		}),
		text,
		excerptLines: extractExcerptLines(text, limits.maxExcerptLines),
		url: log.url ?? null,
		durationMs: log.durationMs ?? null,
		truncated,
		notes,
		errors,
	};
};

const isRelevantJob = (job: {
	readonly status: RemoteDiagnosticExecutionStatus;
	readonly log: IRemoteDiagnosticLogEvidence | null;
	readonly artifacts: readonly IRemoteDiagnosticArtifact[];
}): boolean => {
	if (RELEVANT_STATUSES.has(job.status)) return true;
	if (job.log?.availability === 'partial') return true;
	if ((job.log?.errors.length ?? 0) > 0) return true;
	return job.artifacts.length > 0;
};

const jobSortKey = (job: {
	readonly finishedAt?: string;
	readonly startedAt?: string;
	readonly createdAt?: string;
}): number =>
	Math.max(
		toTimestamp(job.finishedAt),
		toTimestamp(job.startedAt),
		toTimestamp(job.createdAt),
	);

const selectLatestRun = (
	runs: readonly IRemoteDiagnosticRunCandidate[],
): IRemoteDiagnosticRunCandidate | null => {
	if (runs.length === 0) return null;
	return (
		[...runs].sort((left, right) =>
			compareDesc(latestRunTimestamp(left), latestRunTimestamp(right)),
		)[0] ?? null
	);
};

const buildJobs = (
	resource: IRemoteDiagnosticResourceInput,
	selected: IRemoteDiagnosticRunCandidate,
	limits: IRemoteDiagnosticLimits,
): {
	readonly jobs: readonly IRemoteDiagnosedJob[];
	readonly notes: readonly string[];
	readonly truncated: IRemoteTruncationInfo | null;
} => {
	const notes: string[] = [];
	const sourceJobs = selected.jobs ?? selected.run.jobs ?? [];
	const diagnosed = sourceJobs
		.map<IRemoteDiagnosedJob>((job) => {
			const artifacts = dedupeArtifacts(job.artifacts ?? []);
			const processedLog = processLog(job.log, limits);
			return {
				...job,
				relevance: FAILED_STATUSES.has(job.status)
					? 'failed'
					: 'relevant',
				correlation: correlationFor({
					resource,
					run: selected.run,
					job,
				}),
				log: processedLog,
				artifacts,
			};
		})
		.filter((job) => FAILED_STATUSES.has(job.status) || isRelevantJob(job))
		.sort((left, right) => {
			const failedBias =
				Number(FAILED_STATUSES.has(right.status)) -
				Number(FAILED_STATUSES.has(left.status));
			if (failedBias !== 0) return failedBias;
			return compareDesc(jobSortKey(left), jobSortKey(right));
		});

	const limited = diagnosed.slice(0, limits.maxRelevantJobs);
	const truncated =
		diagnosed.length > limits.maxRelevantJobs
			? {
					truncated: true,
					reason: 'server-limit' as const,
					originalBytes: null,
					keptBytes: null,
					originalLines: diagnosed.length,
					keptLines: limited.length,
				}
			: null;
	if (diagnosed.length > limits.maxRelevantJobs) {
		notes.push(
			`omitted ${diagnosed.length - limits.maxRelevantJobs} additional relevant jobs`,
		);
	}
	return {
		jobs: limited,
		notes,
		truncated,
	};
};

const buildArtifactsEvidence = (
	run: IRemoteSelectedDiagnosticRun | null,
): IRemoteDiagnosticSubjectEvidence<readonly IRemoteDiagnosticArtifact[]> => {
	if (run === null) {
		return evidenceOf<readonly IRemoteDiagnosticArtifact[]>({
			value: null,
		});
	}
	const artifacts = dedupeArtifacts([
		...run.artifacts,
		...run.jobs.flatMap((job) => job.artifacts),
	]);
	return evidenceOf({
		value: artifacts,
		notes:
			artifacts.length === 0
				? ['no relevant artifacts were attached']
				: [],
	});
};

const aggregateAvailability = (
	evidences: readonly IRemoteDiagnosticSubjectEvidence<unknown>[],
): RemoteDiagnosticEvidenceAvailability => {
	if (evidences.some((evidence) => evidence.availability === 'partial')) {
		return 'partial';
	}
	if (evidences.some((evidence) => evidence.availability === 'unavailable')) {
		return evidences.some(
			(evidence) => evidence.availability === 'complete',
		)
			? 'partial'
			: 'unavailable';
	}
	return 'complete';
};

const reportFrom = (input: {
	readonly resource: IRemoteResolvedDiagnosticResource;
	readonly run: IRemoteSelectedDiagnosticRun | null;
	readonly jobs: readonly IRemoteDiagnosedJob[];
	readonly evidenceAvailability: RemoteDiagnosticEvidenceAvailability;
}): IRemoteDiagnosticReport => {
	if (input.run === null) {
		return {
			summary: `No remote execution was found for ${input.resource.identifier}.`,
			probableCause: 'Remote execution evidence is unavailable.',
			proposedFix:
				'Resolve the provider resource, fetch the latest execution metadata, and retry the diagnosis with bounded job logs.',
			confidence: 'low',
			evidence: [`resource: ${input.resource.identifier}`],
		};
	}

	const failedJobs = input.jobs.filter((job) =>
		FAILED_STATUSES.has(job.status),
	);
	const focusJob = failedJobs[0] ?? input.jobs[0] ?? null;
	const focusLines = focusJob?.log?.excerptLines ?? [];
	const probableCause =
		focusJob === null
			? `Run ${input.run.name} is ${input.run.status} without job-level failure evidence.`
			: focusLines.length > 0
				? `${focusJob.name} failed with ${focusLines.join(' | ')}`
				: `${focusJob.name} is ${focusJob.status} and remains the most relevant failing job.`;
	const confidence: RemoteDiagnosticConfidence =
		focusLines.length > 0 && focusJob?.log?.availability === 'complete'
			? 'high'
			: failedJobs.length > 0
				? 'medium'
				: 'low';
	const target =
		normalizeRefName(input.resource.ref) ??
		input.resource.commit?.sha ??
		input.resource.identifier;
	const proposedFix =
		focusJob === null
			? `Inspect the selected run for ${target}, fetch the latest execution metadata, retrieve failed job details, and only then decide whether a remote retry or code change is justified.`
			: `Fix the failing step in ${focusJob.name} for ${target}${focusLines.length > 0 ? ` by addressing: ${focusLines.join(' | ')}` : ''}. Re-run the remote pipeline or workflow only after confirming the change.`;
	return {
		summary: `Selected ${input.run.kind} ${input.run.name} (${input.run.status}) for ${input.resource.identifier}.`,
		probableCause,
		proposedFix,
		confidence,
		evidence: [
			`resource: ${input.resource.identifier}`,
			`run: ${input.run.name} (${input.run.status})`,
			`jobs: ${input.jobs.map((job) => `${job.name}:${job.status}`).join(', ') || 'none'}`,
			`evidence: ${input.evidenceAvailability}`,
		],
	};
};

export const diagnoseRemoteExecution = (
	input: IRemoteDiagnosticInput,
): IRemoteDiagnosticResult => {
	const limits: IRemoteDiagnosticLimits = {
		...DEFAULT_REMOTE_DIAGNOSTIC_LIMITS,
		...input.limits,
	};
	const provider = input.provider ?? input.resource.project.provider;
	const resourceValue: IRemoteResolvedDiagnosticResource = {
		provider,
		project: input.resource.project,
		identifier: resolveResourceIdentifier(input.resource.project, provider),
		ref: input.resource.ref ?? null,
		commit: input.resource.commit ?? null,
		review: input.resource.review ?? null,
	};
	const resourceEvidence = evidenceOf({
		value: resourceValue,
		notes:
			input.resource.project.provider !== provider
				? ['input provider overrides the project provider']
				: [],
	});

	const selectedCandidate = selectLatestRun(input.runs);
	const runBase = selectedCandidate?.run ?? null;
	const commitEvidence = resolveCommitEvidence(input.resource, runBase);
	const reviewEvidence = evidenceOf<IRemoteDiagnosticReview>({
		value: input.resource.review ?? null,
		notes:
			input.resource.review === undefined
				? ['review metadata was not provided by the caller']
				: [],
	});
	const refEvidence = resolveRefEvidence(input.resource, runBase);

	let runEvidence: IRemoteDiagnosticSubjectEvidence<IRemoteSelectedDiagnosticRun>;
	let jobsEvidence: IRemoteDiagnosticSubjectEvidence<
		readonly IRemoteDiagnosedJob[]
	>;
	let artifactsEvidence: IRemoteDiagnosticSubjectEvidence<
		readonly IRemoteDiagnosticArtifact[]
	>;

	if (selectedCandidate === null) {
		runEvidence = evidenceOf<IRemoteSelectedDiagnosticRun>({
			value: null,
			notes: ['no candidate executions were provided'],
		});
		jobsEvidence = evidenceOf<readonly IRemoteDiagnosedJob[]>({
			value: null,
			notes: ['job evidence depends on a selected run'],
		});
		artifactsEvidence = evidenceOf<readonly IRemoteDiagnosticArtifact[]>({
			value: null,
			notes: ['artifact evidence depends on a selected run'],
		});
	} else {
		const jobs = buildJobs(input.resource, selectedCandidate, limits);
		const correlation = correlationFor({
			resource: input.resource,
			run: selectedCandidate.run,
		});
		const selectedRun: IRemoteSelectedDiagnosticRun = {
			...selectedCandidate.run,
			jobs: jobs.jobs,
			artifacts: dedupeArtifacts(
				selectedCandidate.artifacts ??
					selectedCandidate.run.artifacts ??
					[],
			),
			correlation,
		};
		runEvidence = evidenceOf({
			value: selectedRun,
			notes: [
				...(selectedCandidate.partial === true
					? ['selected run came from partial provider data']
					: []),
				...correlation.notes,
			],
			errors: selectedCandidate.errors ?? [],
		});
		jobsEvidence = evidenceOf<readonly IRemoteDiagnosedJob[]>({
			value: jobs.jobs,
			notes: jobs.notes,
			errors: selectedCandidate.errors ?? [],
			truncated: jobs.truncated,
		});
		artifactsEvidence = buildArtifactsEvidence(selectedRun);
	}

	const evidenceAvailability = aggregateAvailability([
		resourceEvidence,
		commitEvidence,
		reviewEvidence,
		refEvidence,
		runEvidence,
		jobsEvidence,
		artifactsEvidence,
	]);
	const report = reportFrom({
		resource: resourceValue,
		run: runEvidence.value,
		jobs: jobsEvidence.value ?? [],
		evidenceAvailability,
	});

	return {
		provider,
		resource: resourceEvidence,
		commit: commitEvidence,
		review: reviewEvidence,
		ref: refEvidence,
		run: runEvidence,
		jobs: jobsEvidence,
		artifacts: artifactsEvidence,
		evidenceAvailability,
		report,
	};
};
