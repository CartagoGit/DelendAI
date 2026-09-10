/**
 * types.ts — the vocabulary of the pull-request integration engine, kept
 * in one file so every step (`pull-request-step`, `validation-step`,
 * `merge-step`, `cleanup-step`) reads as pure mechanism.
 *
 * WHY the shapes look the way they do:
 *
 *  - Every operation returns a RESULT and never throws for an expected
 *    outcome. "The head moved", "CI is red", "the merge was refused
 *    because the base changed" are facts about the candidate that another
 *    component has to route on; a thrown error would flatten all three
 *    into "something went wrong" and lose the evidence.
 *  - A candidate carries its OWN base integration sha. That single field
 *    is what makes strict-latest checkable: the engine can always ask
 *    "was this validated against the head the branch has right now?"
 *    rather than trusting that it was recent.
 *  - Optional fields are written `readonly x?: T` and only ever assembled
 *    through an explicit spread — `exactOptionalPropertyTypes` is on.
 */

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

/** Verdict of the required checks for one candidate sha. */
export const VALIDATION_VERDICTS = ['green', 'red', 'pending'] as const;
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

/**
 * Outcome of one cycle. The discriminator is deliberately fine-grained:
 * an orchestrator schedules very differently for `awaiting-checks`
 * (wait), `revalidating` (CI is running again on a rebased candidate),
 * `stale` (retry immediately, the head moved under us) and `blocked`
 * (hand back to the agent — the work is red).
 */
export const CYCLE_STATUSES = [
	/** The policy does not use pull requests; this engine declined. */
	'declined',
	/** A pull request was opened for this candidate. */
	'opened',
	/** The existing pull request was advanced to a new candidate sha. */
	'updated',
	/** Required checks have not concluded yet. */
	'awaiting-checks',
	/** Required human approvals are missing. */
	'awaiting-approval',
	/** Required checks are red — the candidate must not merge. */
	'blocked',
	/** The head moved; the candidate was rebased and needs new checks. */
	'revalidating',
	/** The head moved between validation and merge; the CAS refused. */
	'stale',
	/** The candidate merged and the integration branch advanced. */
	'merged',
	/** The rebase onto the new head could not be replayed. */
	'RECOVERY_CONFLICT',
	/** Something below the engine failed (git, forge transport). */
	'failed',
] as const;
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
