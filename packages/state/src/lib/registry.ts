/**
 * registry.ts — `IStateRegistry` public contract.
 *
 * q00018 Phase 0 S3. The registry is the single entry point
 * plugins use to:
 *
 *   - register producers (`defineProducer`)
 *   - compute the project fingerprint (`computeFingerprint`)
 *   - hydrate a fresh generation (`hydrate`)
 *   - apply changes incrementally (`incremental`)
 *   - read state (`get`, `query`)
 *   - acquire leases for writes (`tryWrite`)
 *
 * The contract is driver-agnostic. `InMemoryStateRegistry` is
 * the Phase 0 implementation. Phase 1 will introduce a SQLite
 * driver behind the same surface.
 */

import type { IProducerInput, ProjectFingerprint } from './fingerprint';
import type { CanonicalProjection } from './hash';
import type {
	GenerationId,
	GenerationWriteOutcome,
	HydrateFailureReason,
	IStateGeneration,
} from './generation';
import type {
	IProjectionResult,
	IStateChange,
	IStateProducer,
} from './producer';
import type { IStateScope } from './scope';

/**
 * A lease the registry hands back to a producer after a
 * successful `tryWrite`. The lease is paired with the generation
 * it was issued for; if the generation is replaced, all leases
 * issued under it are invalidated.
 */
export interface IProducerLease {
	readonly generationId: GenerationId;
	readonly leaseToken: number;
	/** Release the lease. The generation's holder count decrements. */
	release(): void;
}

/**
 * Read result. Either ok with the canonical projection or a
 * structured failure (corrupted generation, unknown producer,
 * unknown scope).
 */
export type IReadResult =
	| {
			readonly ok: true;
			readonly generation: IStateGeneration;
			readonly projection: CanonicalProjection;
	  }
	| {
			readonly ok: false;
			readonly reason: HydrateFailureReason | 'no_active_generation';
			readonly detail?: string;
	  };

/** Input the host passes to `hydrate()` and `incremental()`. */
export interface IHydrateArgs {
	readonly scope: IStateScope;
	/**
	 * The fingerprint the host computed for the current sources.
	 * If `fingerprint` does not match the fingerprint the engine
	 * computes from the registered producers' inputs, the engine
	 * rebuilds from scratch (defensive default).
	 */
	readonly fingerprint?: ProjectFingerprint;
}

/** Public contract every State Registry driver must satisfy. */
export interface IStateRegistry {
	/**
	 * Register a producer. The registry refuses ill-formed
	 * producers (`isProducerWellFormed` returns false) or
	 * duplicates (same id + abiVersion + producerVersion). When a
	 * new producerVersion of an existing id is registered, the
	 * registry bumps the active generation for every scope the
	 * producer serves.
	 */
	defineProducer(producer: IStateProducer): IStateProducer;

	/**
	 * Compute the fingerprint from the currently-registered
	 * producers and the host's input digests. The host computes
	 * the input digests from its own filesystem layer; the engine
	 * just composes them.
	 */
	computeFingerprint(
		salt?: string,
		hostInputs?: ReadonlyMap<string, readonly IProducerInput[]>,
	): ProjectFingerprint;

	/**
	 * Hydrate from scratch. Reads every declared input, calls
	 * `rebuild()` on every producer that serves `scope.kind`,
	 * composes the canonical projections, computes the
	 * `canonicalHash`, and publishes a new generation.
	 */
	hydrate(
		args: IHydrateArgs,
	):
		| { readonly ok: true; readonly generation: IStateGeneration }
		| {
				readonly ok: false;
				readonly reason: HydrateFailureReason;
				readonly detail?: string;
		  };

	/**
	 * Apply a change on top of the current active generation. The
	 * engine iterates producers that serve `scope.kind`, calls
	 * `reconcile(ctx, change)` on each, and composes the result.
	 * If no base generation exists, the engine falls back to
	 * `hydrate()`.
	 */
	incremental(
		args: IHydrateArgs,
		change: IStateChange,
	):
		| { readonly ok: true; readonly generation: IStateGeneration }
		| {
				readonly ok: false;
				readonly reason: HydrateFailureReason;
				readonly detail?: string;
		  };

	/** Read the canonical projection of a producer for a scope. */
	get(args: {
		readonly scope: IStateScope;
		readonly producerId: string;
	}): IReadResult;

	/**
	 * Try to acquire a lease for a write against the active
	 * generation. Returns `STALE_GENERATION` if the generation
	 * has been replaced since the caller captured it.
	 */
	tryWrite(args: {
		readonly scope: IStateScope;
		readonly generationId: GenerationId;
		readonly leaseToken: number;
		readonly payload: IProjectionResult;
	}): GenerationWriteOutcome;

	/** Release a lease. Idempotent. */
	releaseLease(args: {
		readonly scope: IStateScope;
		readonly generationId: GenerationId;
		readonly leaseToken: number;
	}): void;

	/**
	 * Drain the active generation and publish a new one with the
	 * given projection. Used by `tryWrite` and by callers that
	 * want to publish a manual change. The previous generation
	 * transitions to `draining`; the registry reaps it once its
	 * `holderCount === 0`.
	 */
	publish(args: {
		readonly scope: IStateScope;
		readonly parentId?: GenerationId;
		readonly projections: ReadonlyMap<string, IProjectionResult>;
	}): IStateGeneration;

	/** Force-GC any `draining` generations whose holders hit zero. */
	gc(scope?: IStateScope): number;

	/**
	 * Diagnostic: return the list of active generations per
	 * scope. Useful for `state_health`-style tools and for the
	 * property tests.
	 */
	diagnose(): readonly IStateGeneration[];

	/** Tear-down for tests. Drops every generation and lease. */
	resetForTests(): void;
}

/** Clock injected for testability. Defaults to `() => Date.now()`. */
export type StateClock = () => number;

/** Options every driver shares. SQLite driver will add its own. */
export interface IStateRegistryOptions {
	readonly clock?: StateClock;
	/**
	 * Stable salt for the fingerprint. Defaults to the empty
	 * string; the host should pass a value derived from the
	 * repo-instance id.
	 */
	readonly defaultSalt?: string;
}
