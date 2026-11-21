import type { ROADMAP_GATE_STATUSES } from '../constants/gate.constant';

export type IRoadmapGateStatus = (typeof ROADMAP_GATE_STATUSES)[number];

/** One gate's answer, always with the reason for it. */
export interface IRoadmapGateVerdict {
	readonly status: IRoadmapGateStatus;
	readonly reason: string;
}

/**
 * What is known about the world, handed in by the caller. Every lookup may
 * answer `undefined`, which means "no evidence" and never "not met".
 */
export interface IRoadmapGateEvidence {
	/** The status a proposal currently has, by id. */
	readonly proposalStatus?: (id: string) => string | undefined;
	/** Whether a workspace-relative path exists. */
	readonly pathExists?: (path: string) => boolean | undefined;
	/** The conclusion a named check last reported. */
	readonly checkConclusion?: (name: string) => string | undefined;
	/** Whether a person has attested the described condition. */
	readonly attested?: (description: string) => boolean | undefined;
}
