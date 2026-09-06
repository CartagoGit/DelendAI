/**
 * registry.ts — `IStateRegistry` public contract.
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

import type { IStateStorageIdentity } from './fingerprint';
import type { CanonicalProjection, CanonicalJsonValue } from './hash';
import type {
	GenerationFenceOutcome,
	IHydrateResult,
	IProjectLeaseToken,
	StateGeneration,
	ISwarmLeaseToken,
} from './generation';
import type {
	IStateChange,
	IStateProducer,
	IStateInputSnapshot,
} from './producer';
import type { StateScope } from './scope';

/**
 * A lease the registry hands back to a producer for project-level
 * writes. The lease is paired with the generation it was issued
 * for; if the generation is replaced, every project lease issued
 * under it is invalidated.
 *
 * Phase 0.2 (x00502 S4): symmetric with `ISwarmClaimHandle`. The
 * `leaseId` is unique PER ACQUISITION (a monotonic serial), so
 * two agents that capture the same `(generationId, token)` obtain
 * distinct lease ids and count as two independent holders.
 */
export interface IProjectLeaseHandle {
	readonly generationId: import('./generation').IGenerationId;
	readonly token: IProjectLeaseToken;
	/** Unique per acquisition; pass to `releaseProjectLease`. */
	readonly leaseId: string;
	/** Release the lease; the generation holder count decrements. */
	release(): void;
}

/**
 * A claim the registry hands back for swarm-level coordination.
 * Distinct from `IProjectLeaseHandle`: a swarm claim is bound to
 * the slot (e.g. a slice id), not to a generation; replacing the
 * active generation does NOT invalidate swarm claims.
 *
 * Phase 0.2: the handle's `token` field is the token originally
 * issued. After `renew()` the registry holds a new token; the
 * handle exposes it via `currentToken` (a getter) so consumers
 * can keep using the same handle object across renewals. The
 * original `token` is NOT mutated — Phase 0.1 callers that
 * captured the original token continue to work.
 */
export interface ISwarmClaimHandle {
	readonly slot: string;
	readonly token: ISwarmLeaseToken;
	/** Phase 0.2: the token currently in the registry. */
	readonly currentToken: ISwarmLeaseToken;
	/** Renew: returns a new token; the old token is invalidated. */
	renew(): ISwarmLeaseToken;
	/** Release. */
	release(): void;
}

/** Result of a read. */
export type IReadResult =
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
	readonly storageIdentity: IStateStorageIdentity;
	/**
	 * Frozen input snapshot. The host MUST compute digests and
	 * freeze contents BEFORE calling `hydrate()`. The fingerprint
	 * inside the snapshot is what the registry uses to decide
	 * whether the generation is still valid.
	 */
	readonly snapshot: IStateInputSnapshot;
}

/** Public contract every driver must satisfy. */
export interface IStateRegistry {
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
	hydrate(input: IHydrateInput): IHydrateResult;

	/**
	 * Apply a change on top of the current active generation. The
	 * engine iterates producers that serve `scope.kind`, calls
	 * `reconcile(ctx, change)` on each, validates, and composes
	 * the result. If no base generation exists, the engine falls
	 * back to `hydrate()`.
	 */
	incremental(input: IHydrateInput, change: IStateChange): IHydrateResult;

	/** Read the canonical projection of a producer. */
	lookup(args: {
		readonly scope: StateScope;
		readonly producerId: string;
	}): IReadResult;

	/**
	 * Try to acquire a project-generation lease for a write.
	 * Phase 0.2 (x00502 S4): hands back an `IProjectLeaseHandle`
	 * (with a unique per-acquisition `leaseId` and a `release()`
	 * method) when the supplied `(generationId, token)` matches
	 * the current active generation — symmetric with
	 * `acquireSwarmClaim`. Otherwise returns `IFenceRejected`.
	 */
	acquireProjectLease(args: {
		readonly scope: StateScope;
		readonly generationId: import('./generation').IGenerationId;
		readonly token: IProjectLeaseToken;
	}): IProjectLeaseHandle | import('./generation').IFenceRejected;

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
	}): ISwarmClaimHandle;

	/**
	 * Renew an existing swarm claim. Returns `STALE_SWARM_LEASE`
	 * when the slot was already claimed by another holder.
	 */
	renewSwarmClaim(args: {
		readonly scope: StateScope;
		readonly slot: string;
		readonly token: ISwarmLeaseToken;
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
	 *
	 * Phase 0.3 (x00504 S4 / reviewer): the helper also accepts
	 * a host-supplied `byProducer` map so a snapshot's fingerprint
	 * can be computed without depending on whether the driver is
	 * in-memory or SQLite. The previous public surface only
	 * returned the empty-resolved fingerprint, forcing
	 * `snapshotFromResolved` to `instanceof InMemoryStateRegistry`
	 * to reach the resolved-input variant — a hard blocker for
	 * any non-in-memory driver. The single method here is the
	 * only contract every driver needs to implement.
	 */
	seedFingerprint(
		resolved?: ReadonlyMap<
			string,
			readonly import('./fingerprint').IResolvedProducerInput[]
		>,
	): import('./fingerprint').ICanonicalProjectFingerprint;

	/**
	 * Validate a host-supplied snapshot against the registered
	 * producers. Returns a list of issues; an empty list means the
	 * snapshot is consistent with the registry's understanding.
	 *
	 * Phase 0.2 (x00502 S3): the check is split in two halves and
	 * the facade concatenates them:
	 *
	 *   - `validateSnapshotIntegrity(snapshot)` — self-consistency:
	 *     digest ↔ contents, no duplicates, no orphan contents,
	 *     `byProducer` coherent with declared specs, and every
	 *     input the snapshot fingerprint mentions has content.
	 *
	 *   - `validateSnapshotAgainstRegistry(snapshot, scope?)` —
	 *     the snapshot's fingerprint must equal the fingerprint
	 *     the registry computes from its registered producers +
	 *     the snapshot's own resolved inputs (scope-relevant
	 *     producers only).
	 *
	 * The driver calls both on every `hydrate()` /
	 * `incremental()` BEFORE running producers; hosts can call
	 * either half explicitly for finer-grained diagnostics.
	 */
	validateSnapshot(snapshot: IStateInputSnapshot): readonly ISnapshotIssue[];

	/**
	 * Phase 0.2 (x00502 S3): self-consistency half of
	 * `validateSnapshot`. See the facade docs for the exact
	 * checks.
	 */
	validateSnapshotIntegrity(
		snapshot: IStateInputSnapshot,
	): readonly ISnapshotIssue[];

	/**
	 * Phase 0.2 (x00502 S3): registry-comparison half of
	 * `validateSnapshot` — the snapshot fingerprint must equal
	 * the registry's fingerprint computed from its producers +
	 * the snapshot's resolved inputs. `scope` narrows the
	 * comparison to producers that serve that scope kind.
	 */
	validateSnapshotAgainstRegistry(
		snapshot: IStateInputSnapshot,
		scope?: StateScope,
	): readonly ISnapshotIssue[];

	/** Tear down for tests. */
	resetForTests(): void;
}

/** Single issue from `validateSnapshot`. */
export interface ISnapshotIssue {
	readonly kind:
		| 'producer_missing_inputs'
		| 'producer_orphan_inputs'
		| 'fingerprint_mismatch'
		| 'orphan_contents'
		| 'duplicate_input'
		// Phase 0.3 (x00504 S2): a host's claimed digest must
		// match sha256(content). Without this check, two hosts can
		// store completely different bytes under the same claimed
		// digest and the cache would treat them as identical.
		| 'digest_mismatch';
	readonly producerId?: string;
	readonly key?: string;
	readonly detail?: string;
}

/** Clock injected for testability. Production hosts pass `() => Date.now()`. */
export type IStateClock = () => number;

/** Options shared by every driver. SQLite driver (Phase 1) will extend. */
export interface IStateRegistryOptions {
	readonly clock: IStateClock;
}

/** Convenience: the JSON-safe base type used by canonical projection. */
export type IProjectionRoot = CanonicalJsonValue;
