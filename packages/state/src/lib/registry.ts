/**
 * registry.ts — `StateRegistry` public contract.
 *
 * q00018 Phase 0.1. The same single entry point Phase 0 had, but
 * with three corrections:
 *
 *   - the host injects the input snapshot (`IStateInputSnapshot`)
 *     on every `hydrate()` and `incremental()`. Producers never
 *     read `fs` themselves.
 *
 *   - project-level and swarm-level fences are separate APIs:
 *     `acquireProjectLease` / `tryProjectWrite` /
 *     `acquireSwarmClaim` / `trySwarmRenew`.
 *
 *   - `lookup({ scope, producerId })` no longer leaks the
 *     implementation detail that "active generation is the only
 *     readable one". Returns the canonical projection + the
 *     generation it came from.
 */

import type {
	CanonicalProjectFingerprint,
	StateStorageIdentity,
} from './fingerprint';
import type { CanonicalProjection, CanonicalJsonValue } from './hash';
import type {
	GenerationFenceOutcome,
	HydrateResult,
	ProjectLeaseToken,
	StateGeneration,
	SwarmLeaseToken,
} from './generation';
import type {
	IStateChange,
	IStateProducer,
	IStateInputSnapshot,
	ProjectionResult,
} from './producer';
import type { StateScope } from './scope';

/**
 * A lease the registry hands back to a producer for project-level
 * writes. The lease is paired with the generation it was issued
 * for; if the generation is replaced, every project lease issued
 * under it is invalidated.
 */
export interface ProjectLeaseHandle {
	readonly generationId: import('./generation').GenerationId;
	readonly token: ProjectLeaseToken;
	/** Release the lease; the generation holder count decrements. */
	release(): void;
}

/**
 * A claim the registry hands back for swarm-level coordination.
 * Distinct from `ProjectLeaseHandle`: a swarm claim is bound to
 * the slot (e.g. a slice id), not to a generation; replacing the
 * active generation does NOT invalidate swarm claims.
 */
export interface SwarmClaimHandle {
	readonly slot: string;
	readonly token: SwarmLeaseToken;
	/** Renew: returns a new token; the old token is invalidated. */
	renew(): SwarmLeaseToken;
	/** Release. */
	release(): void;
}

/** Result of a read. */
export type ReadResult =
	| {
			readonly ok: true;
			readonly generation: StateGeneration;
			readonly projection: CanonicalProjection;
	  }
	| {
			readonly ok: false;
			readonly reason:
				| 'no_active_generation'
				| 'producer_not_found'
				| 'projection_invalid';
			readonly detail?: string;
	  };

/** Host-supplied input to `hydrate()` / `incremental()`. */
export interface IHydrateInput {
	readonly scope: StateScope;
	readonly storageIdentity: StateStorageIdentity;
	/**
	 * Frozen input snapshot. The host MUST compute digests and
	 * freeze contents BEFORE calling `hydrate()`. The fingerprint
	 * inside the snapshot is what the registry uses to decide
	 * whether the generation is still valid.
	 */
	readonly snapshot: IStateInputSnapshot;
}

/** Public contract every driver must satisfy. */
export interface StateRegistry {
	/**
	 * Register a producer. Refuses ill-formed producers or
	 * duplicates with the same `(id, producerVersion)`. Registering
	 * a NEW `producerVersion` for an existing id is allowed (the
	 * fingerprint changes; the next `hydrate` produces a new
	 * generation).
	 */
	defineProducer(producer: IStateProducer): IStateProducer;

	/**
	 * Hydrate from scratch. Reads every declared input from the
	 * supplied snapshot, calls `rebuild()` on every producer that
	 * serves `scope.kind`, validates the result, composes the
	 * canonical projections, computes the `canonicalHash`, and
	 * publishes a new active generation.
	 */
	hydrate(input: IHydrateInput): HydrateResult;

	/**
	 * Apply a change on top of the current active generation. The
	 * engine iterates producers that serve `scope.kind`, calls
	 * `reconcile(ctx, change)` on each, validates, and composes
	 * the result. If no base generation exists, the engine falls
	 * back to `hydrate()`.
	 */
	incremental(input: IHydrateInput, change: IStateChange): HydrateResult;

	/** Read the canonical projection of a producer. */
	lookup(args: {
		readonly scope: StateScope;
		readonly producerId: string;
	}): ReadResult;

	/**
	 * Try to acquire a project-generation lease for a write. The
	 * registry hands back a `ProjectLeaseHandle` if the supplied
	 * `(generationId, token)` matches the current active
	 * generation. Otherwise, returns a `GenerationFenceOutcome`.
	 */
	acquireProjectLease(args: {
		readonly scope: StateScope;
		readonly generationId: import('./generation').GenerationId;
		readonly token: ProjectLeaseToken;
	}): GenerationFenceOutcome;

	/** Release a previously acquired project lease. Idempotent. */
	releaseProjectLease(args: {
		readonly scope: StateScope;
		readonly leaseId: string;
	}): void;

	/**
	 * Try to claim a swarm slot with a given `slot`. The claim is
	 * valid until `release` or `renew`. Two concurrent claims on
	 * the same slot with the same token return distinct tokens
	 * (second wins); tokens do NOT reset on release.
	 */
	acquireSwarmClaim(args: {
		readonly scope: StateScope;
		readonly slot: string;
	}): SwarmClaimHandle;

	/**
	 * Renew an existing swarm claim. Returns `STALE_SWARM_LEASE`
	 * when the slot was already claimed by another holder.
	 */
	renewSwarmClaim(args: {
		readonly scope: StateScope;
		readonly slot: string;
		readonly token: SwarmLeaseToken;
	}): GenerationFenceOutcome;

	/**
	 * GC draining generations whose holders reached zero. Returns
	 * the number of generations reaped.
	 */
	gc(scope?: StateScope): number;

	/**
	 * Diagnostic: return every generation (including draining /
	 * reaped) for every scope. Useful for `state_health`-style
	 * tools and the property tests.
	 */
	diagnose(): readonly StateGeneration[];

	/**
	 * Compute the canonical fingerprint of the registered
	 * producers. Mirrors the field that `hydrate()` /
	 * `incremental()` build internally; exposed so hosts can
	 * pre-compute the snapshot fingerprint cheaply.
	 */
	seedFingerprint(): import('./fingerprint').CanonicalProjectFingerprint;

	/** Tear down for tests. */
	resetForTests(): void;
}

/** Clock injected for testability. Production hosts pass `() => Date.now()`. */
export type StateClock = () => number;

/** Options shared by every driver. SQLite driver (Phase 1) will extend. */
export interface StateRegistryOptions {
	readonly clock: StateClock;
}

/** Convenience: the JSON-safe base type used by canonical projection. */
export type ProjectionRoot = CanonicalJsonValue;
