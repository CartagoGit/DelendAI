/**
 * persistence.interface.ts — the vocabulary of "where does this
 * checkpoint go?", kept apart from `engine.ts` so the engine gains a
 * seam instead of another branch.
 *
 * WHY this exists at all: before the canonical development policy the
 * commit-policy engine had exactly one answer — stage into `.git/index`,
 * commit onto whatever branch the shared checkout was sitting on, and
 * push it. That answer is correct for `shared-direct` and wrong for
 * every model that persists work to a `wip/*` ref and integrates through
 * a pull request. The engine must not learn to tell those apart by
 * profile name; it asks a PORT, and the port reads the policy's
 * capability booleans.
 *
 * Two distinctions are deliberately made explicit as data, because both
 * were previously implicit in "we commit whenever a trigger fires":
 *
 *  - ROUTE. `direct-commit` is the historical path, byte for byte.
 *    `wip-ref` never opens `.git/index` and never moves the integration
 *    branch. `refused` is the third real answer: a policy can ask for a
 *    persistence strategy that this workspace cannot perform (a
 *    checked-out work branch in a PINNED checkout), and inventing a
 *    behaviour there is how an agent silently moves HEAD under another
 *    agent's feet.
 *  - INTENT. A DURABILITY checkpoint exists so work is not lost. It may
 *    be red, and it must never be handed to integration. A MERGE
 *    CANDIDATE is a coherent unit that goes to a pull request. Both are
 *    written to the same ref by the same mechanism, so the difference
 *    has to be carried as a value — deriving it later from "was the
 *    trigger an interval?" is exactly the guess this field removes.
 *
 * The WIP types here MIRROR `@delendai/core`'s `wip-engine` request and
 * result shapes structurally rather than importing them, so the engine
 * and its specs stay independent of the core engine's module graph. The
 * one file that binds the real engine is `persistence/wip-binding.ts`.
 */

/** Which trigger produced this persistence request. */
export type IPersistenceTriggerKind =
	| 'slice'
	| 'threshold'
	| 'interval'
	| 'manual';

/**
 * A durability checkpoint may be red and is never merged; a merge
 * candidate is coherent and is handed to the integration engine.
 */
export type ICheckpointIntent = 'durability' | 'candidate';

/** What made this a durability checkpoint or a merge candidate. */
export interface ICheckpointClassification {
	readonly intent: ICheckpointIntent;
	/** The boundary that fired, kept for the reason string and the logs. */
	readonly boundary: IPersistenceTriggerKind;
	/**
	 * True when the policy permits this checkpoint to be written even if
	 * the work is red. Only ever true for `durability`.
	 */
	readonly mayBeRed: boolean;
	/** True only for a candidate the integration engine should receive. */
	readonly eligibleForIntegration: boolean;
	/** One sentence naming the trigger and the policy axis that decided. */
	readonly reason: string;
}

/** Refusals the persistence layer can produce, as structured codes. */
export type IPersistenceRefusalCode =
	| 'PINNED_CHECKOUT'
	| 'POLICY_ROUTE_UNSUPPORTED'
	| 'WIP_SCOPE_NARROWED'
	| 'WIP_CHECKPOINT_FAILED';

/** The three routes a resolved policy can select. */
export type IPersistenceRouteKind = 'direct-commit' | 'wip-ref' | 'refused';

/** Route decision, with the reason the policy gave for it. */
export type IPersistenceRoute =
	| {
			readonly kind: 'direct-commit';
			readonly reason: string;
	  }
	| {
			readonly kind: 'wip-ref';
			readonly reason: string;
	  }
	| {
			readonly kind: 'refused';
			readonly code: IPersistenceRefusalCode;
			readonly reason: string;
			/** The concrete configuration change that resolves it. */
			readonly remedy: string;
	  };

/** What the engine hands the persistence port for one event. */
export interface IPersistenceRequest {
	readonly triggerKind: IPersistenceTriggerKind;
	/** Empty when the trigger carries no slice selector. */
	readonly proposalId: string;
	readonly sliceId: string;
	/** Commit subject the engine already composed and validated. */
	readonly message: string;
	/**
	 * The work unit's CLAIMED scope — never a narrowed derivative. The
	 * WIP engine seeds its temporary index from the base commit, so a
	 * request carrying fewer paths than the ref already holds drops
	 * durably-checkpointed work; the engine answers `scope-narrowed`
	 * and this layer surfaces that refusal rather than silencing it.
	 */
	readonly claimedPaths: readonly string[];
	readonly eventId: string;
}

/** What the integration engine was told, and what it answered. */
export interface IIntegrationHandoffReport {
	readonly attempted: boolean;
	/** Cycle status when a handoff happened, else `''`. */
	readonly status: string;
	readonly reason: string;
}

/** The checkpoint that was written, as the engine reports it upward. */
export interface ICheckpointReport {
	readonly ref: string;
	readonly commit: string;
	readonly tree: string;
	readonly patchDigest: string;
	/** Integration commit the checkpoint was built on. */
	readonly baseSha: string;
	/** Concrete files the claim expanded to. */
	readonly scope: readonly string[];
	readonly classification: ICheckpointClassification;
	readonly handoff: IIntegrationHandoffReport;
}

/**
 * Outcome of asking the port to persist.
 *
 * `handled: false` is the load-bearing case: it means the policy routes
 * to `direct-commit` and the engine must fall through to the historical
 * stage/commit/push path completely untouched.
 */
export type IPersistenceOutcome =
	| {
			readonly handled: false;
			readonly reason: string;
	  }
	| {
			readonly handled: true;
			readonly status: 'checkpointed' | 'unchanged';
			readonly report: ICheckpointReport;
	  }
	| {
			readonly handled: true;
			readonly status: 'refused';
			readonly code: IPersistenceRefusalCode;
			readonly reason: string;
			readonly remedy: string;
	  };

/**
 * The seam the engine holds. `route` is synchronous and pure so the
 * engine can consult it in the branch step — a checkout parked on the
 * integration branch is normal under `wip-ref` and must not be refused
 * as "protected" when nothing will ever be committed to it.
 */
export interface ICommitPersistencePort {
	readonly route: IPersistenceRouteKind;
	readonly routeDetail: IPersistenceRoute;
	readonly persist: (
		request: IPersistenceRequest,
	) => Promise<IPersistenceOutcome>;
}

/** Structural mirror of the core WIP engine's checkpoint request. */
export interface IWipCheckpointRequestLike {
	readonly baseSha: string;
	readonly paths: readonly string[];
	readonly ref: string;
	readonly message: string;
	readonly author?: { readonly name: string; readonly email: string };
	readonly allowScopeNarrowing?: boolean;
}

/** Structural mirror of the core WIP engine's checkpoint result. */
export interface IWipCheckpointResultLike {
	readonly status: 'created' | 'unchanged' | 'scope-narrowed' | 'failed';
	readonly ref: string;
	readonly commit: string;
	readonly parent: string;
	readonly tree: string;
	readonly patchDigest: string;
	readonly scope: readonly string[];
	readonly dropped: readonly string[];
	readonly reason?: string;
}

/** The single WIP capability this plugin needs. Injected, never imported. */
export interface IWipCheckpointPort {
	readonly createOrUpdateWipRef: (
		request: IWipCheckpointRequestLike,
	) => Promise<IWipCheckpointResultLike>;
}

/** One merge candidate, as this plugin describes it to integration. */
export interface IMergeCandidateHandoff {
	readonly wipRef: string;
	readonly wipHeadSha: string;
	readonly baseIntegrationSha: string;
	readonly fileScope: readonly string[];
	readonly patchDigest: string;
	readonly proposalId: string;
	readonly sliceId: string;
	readonly title: string;
}

/**
 * The integration engine, as a port. commit-policy has no forge or state
 * credentials of its own, so the host wires this; when it is absent the
 * candidate is still checkpointed and reported as `attempted: false`,
 * which is honest rather than a silently dropped merge.
 */
export interface IIntegrationHandoffPort {
	readonly submit: (
		candidate: IMergeCandidateHandoff,
	) => Promise<{ readonly status: string; readonly reason: string }>;
}
