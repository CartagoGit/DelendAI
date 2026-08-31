import {
	evaluateReleaseReadiness,
	ReleaseStateError,
	releaseStatusCompact as buildReleaseStatusCompact,
	type IReleaseCandidateMetadata,
	type IReleaseGate,
	type IReleaseReadiness,
	type IReleaseStatusCompact,
} from '@mcp-vertex/core/public';

export const validateReleaseReadiness = (
	candidate: IReleaseCandidateMetadata,
	gates: readonly IReleaseGate[],
): IReleaseReadiness => {
	const readiness = evaluateReleaseReadiness(gates);
	if (!readiness.ready)
		throw new ReleaseStateError(
			'readiness-blocked',
			`release ${candidate.slug} is not ready`,
			{
				details: Object.fromEntries(
					readiness.blockingGates.map((name) => [
						name,
						'required gate is not passed',
					]),
				),
			},
		);
	return readiness;
};

export const releaseStatusCompact = (
	candidate: IReleaseCandidateMetadata,
	gates?: readonly IReleaseGate[],
): IReleaseStatusCompact => {
	return buildReleaseStatusCompact(candidate, gates);
};

export const releaseValidate = validateReleaseReadiness;
