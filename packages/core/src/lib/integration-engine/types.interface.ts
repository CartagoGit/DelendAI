/**
 * Contract shapes for `./types`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `types.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `types.ts`, so no import site changes.
 */

import type { CYCLE_STATUSES, VALIDATION_VERDICTS } from './types.constant';

/** The forge-side identity of the repository being integrated into. */
export interface IIntegrationRepositoryRef {
	/** Forge id, e.g. `github`. */
	readonly forge: string;
	readonly owner: string;
	readonly repository: string;
	/** Git remote name the local clone pushes through. */
	readonly remote: string;
}

/**
 * One merge candidate: a WIP checkpoint an agent believes is ready to
 * become part of the integration branch.
 */
export interface IIntegrationCandidate {
	readonly repository: IIntegrationRepositoryRef;
	/** Natural key of the work unit, as the state model spells it. */
	readonly workUnitUid: string;
	readonly proposalUid: string;
	readonly sliceUid: string;
	/** Generation number inside the work unit. */
	readonly generation: number;
	readonly agentId: string;
	readonly machineId: string;
	/** Fully-qualified local WIP ref, e.g. `refs/wip/agent-a/p-s-g1`. */
	readonly wipRef: string;
	/** Commit the ref points at. */
	readonly wipHeadSha: string;
	/** Integration commit this checkpoint was built on and validated against. */
	readonly baseIntegrationSha: string;
	/** Repository-root-relative paths the checkpoint touches. */
	readonly fileScope: readonly string[];
	readonly patchDigest: string;
	/** Pull request title. */
	readonly title: string;
	readonly body?: string;
}

export type IValidationVerdict = (typeof VALIDATION_VERDICTS)[number];

/** Why a verdict came out the way it did, in one sentence, plus detail. */
export interface IValidationReport {
	readonly verdict: IValidationVerdict;
	/** The sha the checks were read for. */
	readonly sha: string;
	/** Required contexts that are still not successful. */
	readonly outstanding: readonly string[];
	/** Required contexts that came back failed/cancelled/timed out. */
	readonly failed: readonly string[];
	readonly reason: string;
}

export type ICycleStatus = (typeof CYCLE_STATUSES)[number];

/** The pull request as this engine needs to see it. */
export interface IIntegrationPullRequest {
	readonly number: number;
	readonly headBranch: string;
	readonly baseBranch: string;
	readonly headSha: string;
	readonly state: 'draft' | 'open' | 'closed' | 'merged';
	readonly mergeSha?: string;
	/** Approving reviews recorded by the forge. */
	readonly approvals: number;
}

/**
 * What the next generation of an in-progress slice must be based on.
 * Present on a `merged` cycle whose slice is NOT finished, which is the
 * whole point of continuous green progress: the slice keeps going, but
 * from the head its own work just produced.
 */
export interface INextGenerationPlan {
	readonly generation: number;
	readonly baseIntegrationSha: string;
}

/** The three recorded facts that justify deleting a merged work ref. */
export interface IWorkRefEvidence {
	/** The forge says the pull request carrying this ref is merged. */
	readonly pullRequestMerged: boolean;
	/** The merge commit the forge produced. Empty when there is none. */
	readonly mergeSha: string;
	/** The sha the state model recorded this generation as integrated at. */
	readonly integratedSha: string;
	/**
	 * Whether the checkpoint commit is reachable from the integration
	 * head. `not-applicable` for squash and rebase merges, which rewrite
	 * the commit by design — there the recorded merge is the evidence.
	 */
	readonly ancestry: 'confirmed' | 'not-applicable' | 'absent';
}

/**
 * What happened to a work ref. `RECOVERABLE` is spelled the way the
 * recovery vocabulary spells it because it leaves this engine and
 * becomes a state another component routes on: unmerged work is never
 * garbage, and never deleted on age.
 */
export interface IWorkRefDisposition {
	readonly ref: string;
	readonly classification: 'integrated' | 'RECOVERABLE';
	readonly action: 'deleted' | 'retained';
	readonly reason: string;
	readonly evidence: IWorkRefEvidence;
}

/** The complete outcome of `runIntegrationCycle`. */
export interface IIntegrationCycleResult {
	readonly status: ICycleStatus;
	/** Candidate commit this cycle acted on (may differ after a rebase). */
	readonly candidateSha: string;
	/** Integration head observed inside the critical section. */
	readonly integrationHeadSha: string;
	readonly reason: string;
	readonly pullRequest?: IIntegrationPullRequest;
	readonly validation?: IValidationReport;
	/** Merge commit, present only on `merged`. */
	readonly mergeSha?: string;
	/** Sha the generation was recorded as integrated at. */
	readonly integratedSha?: string;
	readonly disposition?: IWorkRefDisposition;
	readonly nextGeneration?: INextGenerationPlan;
	/** Paths git could not replay — present only on `RECOVERY_CONFLICT`. */
	readonly conflicts?: readonly string[];
	/** True when this cycle changed nothing because the work was already done. */
	readonly idempotentReplay: boolean;
}
