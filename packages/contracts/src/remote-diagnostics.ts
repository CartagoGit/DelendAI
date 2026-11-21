import type {
	IRemoteGitRef,
	IRemoteProjectCoordinates,
	IRemoteProviderError,
	IRemoteTruncationInfo,
	RemoteProviderId,
} from './remote-provider';

export type {
	IRemoteGitRef,
	IRemoteProjectCoordinates,
	IRemoteProviderError,
	IRemoteTruncationInfo,
	RemoteProviderId,
};

export type RemoteDiagnosticEvidenceAvailability =
	| 'complete'
	| 'partial'
	| 'unavailable';

export type RemoteDiagnosticExecutionKind =
	| 'pipeline'
	| 'workflow-run'
	| 'job-run'
	| 'unknown';

export type RemoteDiagnosticExecutionStatus =
	| 'queued'
	| 'running'
	| 'success'
	| 'failed'
	| 'canceled'
	| 'skipped'
	| 'neutral'
	| 'timed-out'
	| 'unknown';

export type RemoteDiagnosticArtifactKind =
	| 'archive'
	| 'report'
	| 'trace'
	| 'log'
	| 'unknown';

export type RemoteDiagnosticReviewKind =
	| 'pull-request'
	| 'merge-request'
	| 'review'
	| 'unknown';

export type RemoteDiagnosticReviewState =
	| 'open'
	| 'closed'
	| 'merged'
	| 'draft'
	| 'unknown';

export type RemoteDiagnosticConfidence = 'high' | 'medium' | 'low';

export interface IRemoteDiagnosticCommit {
	readonly sha: string;
	readonly title?: string;
	readonly message?: string;
	readonly authorName?: string;
	readonly authoredAt?: string;
	readonly url?: string;
}

export interface IRemoteDiagnosticReview {
	readonly id: string | number;
	readonly number?: string | number;
	readonly kind: RemoteDiagnosticReviewKind;
	readonly state?: RemoteDiagnosticReviewState;
	readonly title?: string;
	readonly url?: string;
	readonly sourceRef?: IRemoteGitRef;
	readonly targetRef?: IRemoteGitRef;
	readonly headSha?: string;
}

export interface IRemoteDiagnosticArtifact {
	readonly id: string | number;
	readonly name: string;
	readonly kind: RemoteDiagnosticArtifactKind;
	readonly sizeBytes?: number;
	readonly expired?: boolean;
	readonly url?: string;
	readonly downloadUrl?: string;
}

export interface IRemoteDiagnosticLogCapture {
	readonly text?: string;
	readonly url?: string;
	readonly durationMs?: number;
	readonly truncation?: IRemoteTruncationInfo | null;
	readonly error?: IRemoteProviderError;
}

export interface IRemoteDiagnosticJob {
	readonly id: string | number;
	readonly name: string;
	readonly stage?: string;
	readonly status: RemoteDiagnosticExecutionStatus;
	readonly conclusion?: string;
	readonly allowFailure?: boolean;
	readonly createdAt?: string;
	readonly startedAt?: string;
	readonly finishedAt?: string;
	readonly url?: string;
	readonly webUrl?: string;
	readonly ref?: IRemoteGitRef;
	readonly sha?: string;
	readonly runnerLabel?: string;
	readonly log?: IRemoteDiagnosticLogCapture | null;
	readonly artifacts?: readonly IRemoteDiagnosticArtifact[];
}

export interface IRemoteDiagnosticRun {
	readonly id: string | number;
	readonly kind: RemoteDiagnosticExecutionKind;
	readonly name: string;
	readonly status: RemoteDiagnosticExecutionStatus;
	readonly conclusion?: string;
	readonly number?: string | number;
	readonly createdAt?: string;
	readonly startedAt?: string;
	readonly finishedAt?: string;
	readonly sha?: string;
	readonly ref?: IRemoteGitRef;
	readonly url?: string;
	readonly webUrl?: string;
	readonly jobs?: readonly IRemoteDiagnosticJob[];
	readonly artifacts?: readonly IRemoteDiagnosticArtifact[];
}

export interface IRemoteDiagnosticRunCandidate {
	readonly run: IRemoteDiagnosticRun;
	readonly jobs?: readonly IRemoteDiagnosticJob[];
	readonly artifacts?: readonly IRemoteDiagnosticArtifact[];
	readonly errors?: readonly IRemoteProviderError[];
	readonly partial?: boolean;
}

export interface IRemoteDiagnosticResourceInput {
	readonly project: IRemoteProjectCoordinates;
	readonly ref?: IRemoteGitRef;
	readonly commit?: IRemoteDiagnosticCommit;
	readonly review?: IRemoteDiagnosticReview;
}

export interface IRemoteDiagnosticLimits {
	readonly maxLogBytes: number;
	readonly maxLogLines: number;
	readonly maxLogDurationMs: number;
	readonly maxRelevantJobs: number;
	readonly maxExcerptLines: number;
}

export interface IRemoteDiagnosticInput {
	readonly provider?: RemoteProviderId;
	readonly resource: IRemoteDiagnosticResourceInput;
	readonly runs: readonly IRemoteDiagnosticRunCandidate[];
	readonly limits?: Partial<IRemoteDiagnosticLimits>;
}

export interface IRemoteDiagnosticSubjectEvidence<T> {
	readonly availability: RemoteDiagnosticEvidenceAvailability;
	readonly value: T | null;
	readonly notes: readonly string[];
	readonly errors: readonly IRemoteProviderError[];
	readonly truncated: IRemoteTruncationInfo | null;
}

export interface IRemoteResolvedDiagnosticResource {
	readonly provider: RemoteProviderId;
	readonly project: IRemoteProjectCoordinates;
	readonly identifier: string;
	readonly ref: IRemoteGitRef | null;
	readonly commit: IRemoteDiagnosticCommit | null;
	readonly review: IRemoteDiagnosticReview | null;
}

export interface IRemoteDiagnosticCorrelation {
	readonly commitMatches: boolean | null;
	readonly refMatches: boolean | null;
	readonly reviewMatches: boolean | null;
	readonly notes: readonly string[];
}

export interface IRemoteDiagnosticLogEvidence {
	readonly availability: RemoteDiagnosticEvidenceAvailability;
	readonly text: string | null;
	readonly excerptLines: readonly string[];
	readonly url: string | null;
	readonly durationMs: number | null;
	readonly truncated: IRemoteTruncationInfo | null;
	readonly notes: readonly string[];
	readonly errors: readonly IRemoteProviderError[];
}

export interface IRemoteDiagnosedJob
	extends Omit<IRemoteDiagnosticJob, 'log' | 'artifacts'> {
	readonly relevance: 'failed' | 'relevant';
	readonly correlation: IRemoteDiagnosticCorrelation;
	readonly log: IRemoteDiagnosticLogEvidence | null;
	readonly artifacts: readonly IRemoteDiagnosticArtifact[];
}

export interface IRemoteSelectedDiagnosticRun
	extends Omit<IRemoteDiagnosticRun, 'jobs' | 'artifacts'> {
	readonly jobs: readonly IRemoteDiagnosedJob[];
	readonly artifacts: readonly IRemoteDiagnosticArtifact[];
	readonly correlation: IRemoteDiagnosticCorrelation;
}

export interface IRemoteDiagnosticReport {
	readonly summary: string;
	readonly probableCause: string;
	readonly proposedFix: string;
	readonly confidence: RemoteDiagnosticConfidence;
	readonly evidence: readonly string[];
}

export interface IRemoteDiagnosticResult {
	readonly provider: RemoteProviderId;
	readonly resource: IRemoteDiagnosticSubjectEvidence<IRemoteResolvedDiagnosticResource>;
	readonly commit: IRemoteDiagnosticSubjectEvidence<IRemoteDiagnosticCommit>;
	readonly review: IRemoteDiagnosticSubjectEvidence<IRemoteDiagnosticReview>;
	readonly ref: IRemoteDiagnosticSubjectEvidence<IRemoteGitRef>;
	readonly run: IRemoteDiagnosticSubjectEvidence<IRemoteSelectedDiagnosticRun>;
	readonly jobs: IRemoteDiagnosticSubjectEvidence<
		readonly IRemoteDiagnosedJob[]
	>;
	readonly artifacts: IRemoteDiagnosticSubjectEvidence<
		readonly IRemoteDiagnosticArtifact[]
	>;
	readonly evidenceAvailability: RemoteDiagnosticEvidenceAvailability;
	readonly report: IRemoteDiagnosticReport;
}
