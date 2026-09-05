/**
 * generation.ts — `IStateGeneration` and fencing tokens.
 *
 * q00018 Phase 0 S4. Every state produced by the State Engine
 * lives inside a generation. Generations are immutable once
 * published; new state creates a new generation. Active readers
 * stay on the generation they opened; the registry publishes a new
 * one and the GC reaps the old after `holders === 0`.
 *
 * Why generations and not "overwrite the SQLite live"?
 *
 *   - Replacing an SQLite file under processes that already opened
 *     it is unreliable across platforms (Windows refuses to rename
 *     an open file; Linux may surprise you with held fd tables).
 *   - The acceptance #1 property (`incremental ≡ cleanRebuild`) is
 *     only meaningful when the engine can compare the *old*
 *     generation with the *new* one without losing data.
 *   - Fencing tokens only make sense when each generation carries
 *     an id; an "active generation pointer" is what an agent uses
 *     to detect that it became stale.
 */

import type { ProjectFingerprint, Sha256Hex } from './fingerprint';

/** Lifecycle phase of a generation. */
export type GenerationStatus =
	/** `rebuild()` / `incremental()` is still running. */
	| 'building'
	/** Published and accepting reads + writes. */
	| 'active'
	/** Replaced by a newer generation; still serves in-flight holders. */
	| 'draining'
	/** `holders === 0` and the GC has collected the projection. */
	| 'reaped';

/** Stable id assigned by the registry; opaque to producers. */
export type GenerationId = string;

/**
 * Fencing token. A number that strictly increases every time the
 * active generation changes for a `(scope, producerId)` pair.
 * Agents write `tryWrite({ generationId, leaseToken })`; the
 * registry accepts only the lease token that matches the current
 * active generation. Stale tokens are rejected with
 * `STALE_GENERATION`.
 */
export type LeaseToken = number;

/**
 * A holder is anything keeping a generation alive past its
 * publication. A long-running read, a tool call that captured the
 * projection, a subagent that received a fencing lease. Holders
 * are refcounted; the GC reaps when the count drops to zero.
 */
export interface IGenerationHolder {
	readonly id: string;
	readonly acquiredAt: number;
	readonly kind: 'reader' | 'lease' | 'subagent';
}

/** Outcome of `tryWrite` when the caller is stale. */
export interface IGenerationStale {
	readonly ok: false;
	readonly reason: 'STALE_GENERATION' | 'LEASE_REVOKED';
	readonly currentGenerationId: GenerationId;
	readonly currentLeaseToken: LeaseToken;
}

/** Outcome of `tryWrite` when the caller is still valid. */
export interface IGenerationAccepted {
	readonly ok: true;
	readonly generationId: GenerationId;
	readonly leaseToken: LeaseToken;
}

export type GenerationWriteOutcome = IGenerationStale | IGenerationAccepted;

/** Outcome of `acquireGeneration` / `commitGeneration`. */
export interface IGenerationLifecycle {
	readonly generationId: GenerationId;
	readonly leaseToken: LeaseToken;
	readonly status: GenerationStatus;
}

/**
 * The immutable record the registry returns when a state
 * generation is ready to read. The `canonicalHash` is computed by
 * `canonicalStateHash` over the canonical projection — it is the
 * id the acceptance tests compare on.
 */
export interface IStateGeneration {
	readonly id: GenerationId;
	readonly parentId?: GenerationId | undefined;
	readonly fingerprint: ProjectFingerprint;
	readonly canonicalHash: Sha256Hex;
	readonly status: GenerationStatus;
	/**
	 * Local metadata the registry emits for observability.
	 * Deliberately excluded from `canonicalHash` (see
	 * `LOCAL_METADATA_KEYS`).
	 */
	readonly createdAt: number;
	readonly leaseToken: LeaseToken;
	readonly holderCount: number;
}

/**
 * Reason an `IHydrateResult` carries an error. Kept narrow so the
 * registry can surface a typed reason to the caller and the
 * property tests can match on it.
 */
export type HydrateFailureReason =
	| 'producer_threw'
	| 'fingerprint_mismatch'
	| 'scope_not_supported';

/**
 * Result of `hydrate()` and `incremental()`. Either ok with a
 * fresh generation or a structured failure the caller can branch
 * on without instanceof checks.
 */
export type IHydrateResult =
	| { readonly ok: true; readonly generation: IStateGeneration }
	| {
			readonly ok: false;
			readonly reason: HydrateFailureReason;
			readonly detail?: string;
	  };
