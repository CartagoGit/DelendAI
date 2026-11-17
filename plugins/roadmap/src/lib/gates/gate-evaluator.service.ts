import {
	DELIVERED_PROPOSAL_STATUSES,
	GREEN_CHECK_CONCLUSIONS,
} from '../contracts/constants/gate.constant';
import type {
	IRoadmapGateEvidence,
	IRoadmapGateVerdict,
} from '../contracts/interfaces/gate.interface';
import type {
	IRoadmapEntry,
	IRoadmapGate,
} from '../contracts/interfaces/roadmap.interface';

const unknown = (reason: string): IRoadmapGateVerdict => ({
	status: 'unknown',
	reason,
});
const pass = (reason: string): IRoadmapGateVerdict => ({
	status: 'pass',
	reason,
});
const fail = (reason: string): IRoadmapGateVerdict => ({
	status: 'fail',
	reason,
});

const needsTarget = (gate: IRoadmapGate): IRoadmapGateVerdict =>
	unknown(
		`${gate.kind} gate names no target, so there is nothing to look up`,
	);

const evaluateProposalDone = (
	target: string,
	evidence: IRoadmapGateEvidence,
): IRoadmapGateVerdict => {
	const status = evidence.proposalStatus?.(target);
	if (status === undefined) {
		return unknown(`no status is known for proposal ${target}`);
	}
	return DELIVERED_PROPOSAL_STATUSES.includes(status)
		? pass(`proposal ${target} is ${status}`)
		: fail(`proposal ${target} is ${status}`);
};

const evaluatePathExists = (
	target: string,
	evidence: IRoadmapGateEvidence,
): IRoadmapGateVerdict => {
	const exists = evidence.pathExists?.(target);
	if (exists === undefined) return unknown(`${target} was not checked`);
	return exists ? pass(`${target} exists`) : fail(`${target} does not exist`);
};

const evaluateCheckGreen = (
	target: string,
	evidence: IRoadmapGateEvidence,
): IRoadmapGateVerdict => {
	const conclusion = evidence.checkConclusion?.(target);
	if (conclusion === undefined) {
		return unknown(`no result is known for check ${target}`);
	}
	return GREEN_CHECK_CONCLUSIONS.includes(conclusion)
		? pass(`check ${target} concluded ${conclusion}`)
		: fail(`check ${target} concluded ${conclusion}`);
};

const evaluateAttestation = (
	description: string,
	evidence: IRoadmapGateEvidence,
): IRoadmapGateVerdict => {
	const attested = evidence.attested?.(description);
	if (attested === undefined) return unknown('nobody has attested this yet');
	return attested ? pass('attested') : fail('attestation was refused');
};

/**
 * Answers one gate from the evidence at hand. A gate nobody can look up
 * answers `unknown`: missing data is not a failure, and treating it as
 * one is how a roadmap ends up with exceptions as the normal case.
 */
export const evaluateGate = (
	gate: IRoadmapGate,
	evidence: IRoadmapGateEvidence,
): IRoadmapGateVerdict => {
	if (gate.kind === 'attestation') {
		return gate.description === undefined
			? unknown('attestation gate describes nothing to attest')
			: evaluateAttestation(gate.description, evidence);
	}
	if (gate.target === undefined) return needsTarget(gate);
	switch (gate.kind) {
		case 'proposal-done':
			return evaluateProposalDone(gate.target, evidence);
		case 'path-exists':
			return evaluatePathExists(gate.target, evidence);
		case 'check-green':
			return evaluateCheckGreen(gate.target, evidence);
	}
};

/**
 * Folds an entry's gates into one verdict: any failure fails it, all
 * passes pass it, and everything else leaves it unknown. An entry with no
 * gates has declared nothing to verify, which is unknown too.
 */
export const evaluateEntryGates = (
	entry: IRoadmapEntry,
	evidence: IRoadmapGateEvidence,
): IRoadmapGateVerdict => {
	if (entry.gates.length === 0) {
		return unknown(`entry ${entry.id} declares no gates`);
	}
	const verdicts = entry.gates.map((gate) => evaluateGate(gate, evidence));
	const failed = verdicts.find((verdict) => verdict.status === 'fail');
	if (failed !== undefined) return failed;
	const open = verdicts.filter((verdict) => verdict.status === 'unknown');
	if (open.length > 0) {
		return unknown(
			`${open.length} of ${verdicts.length} gates of ${entry.id} have no evidence yet`,
		);
	}
	return pass(`all ${verdicts.length} gates of ${entry.id} pass`);
};
