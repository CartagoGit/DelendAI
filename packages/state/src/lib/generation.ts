/**
 * generation.ts — `StateGeneration` + fencing.
 *
 * q00018 Phase 0.1. Two fences, intentionally separate concepts:
 *
 *   - `ProjectGenerationFence` — prevents an agent from writing
 *     against a stale PROJECT generation (the agent captured gen
 *     147, the engine published 148 in the meantime → REJECT).
 *
 *   - `SwarmLeaseFence` — prevents an agent from claiming the
 *     same swarm slot twice (agent A holds lease 71, agent B's
 *     claim granted lease 72, A's zombie renew → REJECT).
 *
 * The previous Phase 0 mixed the two in a single API
 * (`tryWrite({ generationId, leaseToken })`). That conflated
 * "this view of the project is stale" with "this swarm slot was
 * reassigned". They are related but distinct.
 *
 * Lifecycle:
 *   building → active → draining → reaped
 *
 * Generations are IMMUTABLE once `active`. No mutation of an
 * active generation's projections is allowed; a mutation
 * publishes a NEW generation. The Phase 0 `__inline__` mutation
 * hook is gone.
 */

import type { Sha256Hex } from './hash';
import type {
	ICanonicalProjectFingerprint,
	IStateStorageIdentity,
} from './fingerprint';

/** Lifecycle phase of a generation. */
export type IGenerationStatus =
	/** `rebuild()` / `incremental()` is still running. */
	| 'building'
	/** Published and accepting reads. */
	| 'active'
	/** Replaced by a newer generation; still serves in-flight holders. */
	| 'draining'
	/** `holders === 0` and the GC has collected the projection. */
	| 'reaped';

/** Stable id assigned by the registry; opaque to producers. */
export type IGenerationId = string;

/**
 * Fencing for the PROJECT scope. The token strictly increases
 * every time the active generation changes for a scope. A mutation
 * tries to obtain a lease under the current token; out-of-date
 * tokens are rejected with `STALE_PROJECT_GENERATION`.
 */
export type IProjectLeaseToken = number;

/**
 * Fencing for the SWARM scope. Used by claims (queue, leases,
 * resource reservations). The token strictly increases every time
 * a slot is reassigned. Out-of-date tokens are rejected with
 * `STALE_SWARM_LEASE`.
 */
export type ISwarmLeaseToken = number;

/**
 * A holder keeps a generation alive past its publication: a
 * long-running read, a tool call that captured the projection, a
 * subagent that received a fencing lease. Holders are refcounted;
 * the GC reaps when the count drops to zero.
 */
export interface IGenerationHolder {
	readonly id: string;
	readonly acquiredAt: number;
	readonly kind: 'reader' | 'project-lease' | 'swarm-claim' | 'subagent';
}

/** Failure reasons for both fences. */
export type GenerationFenceRejection =
	| 'STALE_PROJECT_GENERATION'
	| 'STALE_SWARM_LEASE'
	| 'PROJECT_GENERATION_NOT_ACTIVE'
	| 'SWARM_LEASE_REVOKED';

/** Successful acquisition outcome for either fence. */
export interface IFenceAccepted {
	readonly ok: true;
	readonly generationId: IGenerationId;
	readonly token: IProjectLeaseToken | ISwarmLeaseToken;
}

/** Failed acquisition outcome. */
export interface IFenceRejected {
	readonly ok: false;
	readonly reason: GenerationFenceRejection;
	readonly currentGenerationId: IGenerationId;
	readonly currentToken: IProjectLeaseToken | ISwarmLeaseToken;
}

export type GenerationFenceOutcome = IFenceAccepted | IFenceRejected;

/**
 * The immutable record the registry returns when a state
 * generation is ready to read. The `canonicalHash` is computed by
 * `canonicalStateHash` over the canonical projection — it is the
 * id the acceptance tests compare on.
 *
 * `canonicalHash` is purely a function of (fingerprint,
 * projection). It does NOT depend on `storageIdentity` or on the
 * `id` field — two machines with the same fingerprint and the same
 * projection bytes produce the same `canonicalHash`.
 */
export interface StateGeneration {
	readonly id: IGenerationId;
	readonly parentId?: IGenerationId;
	/** The canonical fingerprint this generation was built from. */
	readonly fingerprint: ICanonicalProjectFingerprint;
	/** Sha256 of the canonical projection. Pure semantic. */
	readonly canonicalHash: Sha256Hex;
	/**
	 * Status. Newly-created generations are `active`; the previous
	 * generation transitions to `draining`.
	 */
	readonly status: IGenerationStatus;
	/**
	 * Local observability metadata. Excluded from `canonicalHash`
	 * via `LOCAL_METADATA_KEYS`.
	 */
	readonly createdAt: number;
	/** Strictly increasing per-scope; increment on each `publish`. */
	readonly projectLeaseToken: IProjectLeaseToken;
	/**
	 * Host-local storage identity. Excluded from `canonicalHash`;
	 * only used to pick the right slot when reading.
	 */
	readonly storageIdentity: IStateStorageIdentity;
	/**
	 * Current count of holders refcounting this generation. The
	 * driver DERIVES this from the holders map; do not treat it
	 * as a settable field. The field is exposed on
	 * `StateGeneration` purely for diagnostic / observability
	 * use; mutations land through `record.holders`, not through
	 * this field.
	 */
	readonly holderCount: number;
	/**
	 * Marker for drivers that derive `holderCount` from the
	 * holders map instead of mutating it directly. Optional.
	 */
	readonly _holderCountSource?: 'derived';
}

/** Failure reasons for `hydrate` and `incremental`. */
export type IHydrateFailureReason =
	| 'producer_threw'
	| 'fingerprint_mismatch'
	| 'scope_not_supported'
	| 'snapshot_unavailable'
	| 'projection_invalid'
	| 'snapshot_invalid';

/** Result of `hydrate()` and `incremental()`. */
export type IHydrateResult =
	| { readonly ok: true; readonly generation: StateGeneration }
	| {
			readonly ok: false;
			readonly reason: IHydrateFailureReason;
			readonly detail?: string;
	  };
