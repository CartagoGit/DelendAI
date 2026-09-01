import type { IReleaseCandidateMetadata, ReleaseType } from '../release';

export type ReleasePrepareMode = 'dry-run' | 'execute';

export interface IExpectedReleaseState {
	readonly sourceDevelopSha: string;
	readonly mainSha: string;
	readonly mainVersion: string;
}

export interface IReleaseGate {
	readonly name: string;
	readonly status: 'passed' | 'failed' | 'pending' | 'running';
	readonly required?: boolean;
	readonly detail?: string;
}

export interface IReleaseReadiness {
	readonly ready: boolean;
	readonly gates: readonly IReleaseGate[];
	readonly blockingGates: readonly string[];
}

export interface IReleasePrepareInput {
	readonly type: ReleaseType;
	readonly slug: string;
	readonly actor: string;
	readonly expected: IExpectedReleaseState;
	readonly idempotencyKey?: string;
	readonly timestamp?: string;
	readonly includedProposals?: readonly string[];
}

export interface IReleasePreparation {
	readonly mode: ReleasePrepareMode;
	readonly idempotencyKey: string;
	readonly created: boolean;
	readonly candidate: IReleaseCandidateMetadata;
}

export interface IReleaseStatusCompact {
	readonly slug: string;
	readonly branch: string;
	readonly state: IReleaseCandidateMetadata['state'];
	readonly sourceDevelopSha: string;
	readonly baseMainSha: string;
	readonly fromVersion: string;
	readonly targetVersion: string;
	readonly type: ReleaseType;
	readonly readiness?: IReleaseReadiness;
}

export type ReleaseStateErrorCode =
	| 'stale-source'
	| 'stale-main'
	| 'stale-version'
	| 'release-collision'
	| 'duplicate-release'
	| 'not-found'
	| 'readiness-blocked';

export class ReleaseStateError extends Error {
	readonly code: ReleaseStateErrorCode;
	readonly expected?: string;
	readonly actual?: string;
	readonly details?: Readonly<Record<string, string>>;

	constructor(
		code: ReleaseStateErrorCode,
		message: string,
		values: {
			readonly expected?: string;
			readonly actual?: string;
			readonly details?: Readonly<Record<string, string>>;
		} = {},
	) {
		super(message);
		this.name = 'ReleaseStateError';
		this.code = code;
		if (values.expected !== undefined) this.expected = values.expected;
		if (values.actual !== undefined) this.actual = values.actual;
		if (values.details !== undefined) this.details = values.details;
	}
}

export const assertExpectedReleaseState = (
	expected: IExpectedReleaseState,
	actual: IExpectedReleaseState,
): void => {
	if (actual.sourceDevelopSha !== expected.sourceDevelopSha)
		throw new ReleaseStateError(
			'stale-source',
			'release source develop SHA changed since preview',
			{
				expected: expected.sourceDevelopSha,
				actual: actual.sourceDevelopSha,
			},
		);
	if (actual.mainSha !== expected.mainSha)
		throw new ReleaseStateError(
			'stale-main',
			'release main SHA changed since preview',
			{ expected: expected.mainSha, actual: actual.mainSha },
		);
	if (actual.mainVersion !== expected.mainVersion)
		throw new ReleaseStateError(
			'stale-version',
			'release main version changed since preview',
			{ expected: expected.mainVersion, actual: actual.mainVersion },
		);
};

export const evaluateReleaseReadiness = (
	gates: readonly IReleaseGate[],
): IReleaseReadiness => {
	const blockingGates = gates
		.filter((gate) => gate.required !== false && gate.status !== 'passed')
		.map((gate) => gate.name);
	return Object.freeze({
		ready: blockingGates.length === 0,
		gates: Object.freeze([...gates]),
		blockingGates: Object.freeze(blockingGates),
	});
};

export const releaseStatusCompact = (
	candidate: IReleaseCandidateMetadata,
	gates?: readonly IReleaseGate[],
): IReleaseStatusCompact => {
	const readiness =
		gates === undefined ? undefined : evaluateReleaseReadiness(gates);
	return Object.freeze({
		slug: candidate.slug,
		branch: candidate.branch,
		state: candidate.state,
		sourceDevelopSha: candidate.sourceDevelopSha,
		baseMainSha: candidate.baseMainSha,
		fromVersion: candidate.fromVersion,
		targetVersion: candidate.targetVersion,
		type: candidate.type,
		...(readiness === undefined ? {} : { readiness }),
	});
};
