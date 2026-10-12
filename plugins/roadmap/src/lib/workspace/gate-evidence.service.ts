import type { IRoadmapGateEvidence } from '../contracts/interfaces/gate.interface';
import type { IRoadmap } from '../contracts/interfaces/roadmap.interface';
import type { IRoadmapWorkspace } from '../contracts/interfaces/roadmap-workspace.interface';

/**
 * Looks up, once, everything the roadmap's gates name — which paths
 * exist, which status each proposal has — and hands it over as the
 * synchronous evidence the gate evaluator reads. A check's conclusion and
 * a person's attestation have no source here yet, so those gates answer
 * unknown: this version declares conditions, it does not run them.
 */
export const gatherGateEvidence = async (
	roadmap: IRoadmap,
	workspace: Pick<IRoadmapWorkspace, 'pathExists' | 'proposalStatus'>,
): Promise<IRoadmapGateEvidence> => {
	const gates = roadmap.horizons.flatMap((horizon) =>
		horizon.entries.flatMap((entry) => entry.gates),
	);
	const targetsOf = (kind: string): readonly string[] => [
		...new Set(
			gates
				.filter((gate) => gate.kind === kind)
				.flatMap((gate) =>
					gate.target === undefined ? [] : [gate.target],
				),
		),
	];
	const paths = new Map<string, boolean | undefined>();
	for (const path of targetsOf('path-exists')) {
		paths.set(path, await workspace.pathExists(path));
	}
	const proposals = new Map<string, string | undefined>();
	for (const id of targetsOf('proposal-done')) {
		proposals.set(id, await workspace.proposalStatus(id));
	}
	return {
		pathExists: (path) => paths.get(path),
		proposalStatus: (id) => proposals.get(id),
	};
};
