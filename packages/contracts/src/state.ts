/**
 * state.ts — type-only State Engine contract (`IStateRegistry` and
 * its transitive type closure).
 *
 * x00530 S1. These declarations used to live inside
 * `@delendai/state`, a `private: true` package. `@delendai/core`
 * is published and exposes `IStateRegistry` on its PUBLIC plugin
 * contract (`IPluginContext.state`), so a consumer installing
 * `@delendai/core` from npm could not resolve the type at all.
 *
 * The contract now lives here — the package whose entire reason to
 * exist is "pure-TypeScript, type-only, no runtime, publishable".
 * `@delendai/state` re-exports every name from this module, so
 * every existing `import type { … } from '@delendai/state'` keeps
 * working unchanged; the declarations simply have a single home.
 *
 * NOTHING runtime belongs in this file. The canonical hashing,
 * fingerprinting and snapshot helpers stay in `@delendai/state`;
 * only their *types* are here.
 */

/* -------------------------------------------------------------- */
/* brand                                                           */
/* -------------------------------------------------------------- */

/**
 * Nominal branding helper. Byte-identical to `Brand` in
 * `@delendai/contracts/primitives`; re-declared here so the state
 * contract module is importable on its own.
 */
export type StateBrand<T, B extends string> = T & { readonly __brand: B };

/* -------------------------------------------------------------- */
/* hash — value types only                                         */
/* -------------------------------------------------------------- */

/** Lower-case hex SHA-256 digest. */
export type Sha256Hex = string;

/** The JSON subset the canonical serialiser accepts. */
export type CanonicalJsonValue =
	| string
	| number
	| boolean
	| null
	| CanonicalJsonValue[]
	| { readonly [k: string]: CanonicalJsonValue };

/** Anything the producer may return from `canonicalize()`. */
export type CanonicalProjection = CanonicalJsonValue;

/* -------------------------------------------------------------- */
/* scope                                                           */
/* -------------------------------------------------------------- */

/** A stable worktree id derived once by the host. */
export type WorktreeId = StateBrand<string, 'WorktreeId'>;

/** A stable repository instance id derived once by the host (NOT the path). */
export type RepositoryInstanceId = StateBrand<string, 'RepositoryInstanceId'>;

/** The kind of scope a State Engine generation belongs to. */
export type StateScopeKind =
	| 'project'
	| 'swarm'
	| 'shared-content-cache'
	| 'worktree-cache';

/** Per-worktree private cache. Identity = the worktree id. */
export interface IWorktreeCacheLocator {
	readonly workspaceRoot: string;
	readonly cacheRoot: string;
	readonly worktreeId: WorktreeId;
}

/** Per-worktree projection (proposals, package graph, etc.). */
export interface IProjectLocator {
	readonly workspaceRoot: string;
	readonly worktreeId: WorktreeId;
	readonly cacheRoot: string;
	readonly docsRoot: string;
}

/**
 * Shared swarm coordination. Identity = the repository instance id.
 * Two worktrees of the same repo on the same machine share the
 * SAME `swarm` generation; the `workspaceRoot` MAY differ.
 */
export interface ISwarmLocator {
	readonly repositoryInstanceId: RepositoryInstanceId;
	readonly swarmRoot: string;
}

/**
 * Content-addressed cache shared across worktrees. Belongs here
 * ONLY when the cache key is provably independent of the worktree
 * (typically a Git blob SHA + parser version).
 */
export interface ISharedContentCacheLocator {
	readonly repositoryInstanceId: RepositoryInstanceId;
	readonly swarmRoot: string;
	readonly cacheNamespace: string;
}

/**
 * Discriminated union. `locator` narrows by `kind` so an
 * exhaustive switch on `kind` brings the right fields into scope.
 */
export type StateScope =
	| { readonly kind: 'project'; readonly locator: IProjectLocator }
	| { readonly kind: 'swarm'; readonly locator: ISwarmLocator }
	| {
			readonly kind: 'shared-content-cache';
			readonly locator: ISharedContentCacheLocator;
	  }
	| {
			readonly kind: 'worktree-cache';
			readonly locator: IWorktreeCacheLocator;
	  };

/** Type alias that re-uses the union as the public discriminator. */
export type StateLocator = StateScope;

export type StateLocatorOf<K extends StateScopeKind> = Extract<
	StateScope,
	{ kind: K }
>['locator'];

/** Narrowed helper that matches any non-shared scope. */
export type IWorktreeLocalScope = Extract<
	StateScope,
	{ kind: 'project' | 'worktree-cache' }
>;

/** Narrowed helper that matches any shared scope. */
export type ISharedScope = Extract<
	StateScope,
	{ kind: 'swarm' | 'shared-content-cache' }
>;

/* -------------------------------------------------------------- */
/* fingerprint                                                     */
/* -------------------------------------------------------------- */

/** Stable string id for an input source. */
export type IProducerInputKind =
	/** Path glob; digest = sha256 of the listed files' contents. */
	| 'path-glob'
	/** Single file; digest = sha256 of the file bytes. */
	| 'file'
	/** Pre-computed digest of a content-addressed blob. */
	| 'git-blob'
	/** Producer-declared structured input with a manual digest. */
	| 'opaque';

/**
 * Canonical key for a producer input. Used as the
 * `IStateInputSnapshot.byProducer` lookup key.
 */
export interface IInputKey {
	readonly kind: IProducerInputKind;
	readonly locator: string;
	readonly parserVersion?: number;
}

/**
 * Static declaration of an input a producer depends on. It has NO
 * digest and NO content — those are resolved by the host per
 * snapshot.
 */
export interface IProducerInputSpec {
	readonly kind: IProducerInputKind;
	/** Canonical string identifying the input (glob / path / SHA / opaque id). */
	readonly locator: string;
	/** Optional parser version that produced the digest. */
	readonly parserVersion?: number;
}

/**
 * Dynamic input the host resolved for ONE snapshot. The
 * fingerprint derives from `spec + digest`; `content` is what the
 * producer reads inside `rebuild` / `reconcile`.
 */
export interface IResolvedProducerInput {
	readonly spec: IProducerInputSpec;
	/** Lower-case hex sha256 of the input's content (or its listing). */
	readonly digest: Sha256Hex;
	/** Concrete bytes for the current snapshot. May be empty for `opaque`. */
	readonly content: Uint8Array;
}

/**
 * Legacy flat input kept for Phase 0.1 compat. New code MUST use
 * the spec/resolved split.
 */
export interface IProducerInput extends IProducerInputSpec {
	readonly digest: Sha256Hex;
}

/** Producer declaration as it appears in the canonical fingerprint. */
export interface IProducerFingerprintEntry {
	readonly id: string;
	readonly producerVersion: number;
	readonly abiVersion: number;
	/**
	 * Canonicalised SET of inputs (spec + resolved digest, flat
	 * `IProducerInput` form). Entries carry the RESOLVED digest the
	 * host computed for this snapshot.
	 */
	readonly inputs: readonly IProducerInput[];
}

/**
 * The semantic fingerprint of a project. Same fingerprint => same
 * canonical state. NEVER includes the storage identity, the host
 * name, the working directory, or any non-deterministic source.
 */
export interface ICanonicalProjectFingerprint {
	readonly abiVersion: number;
	/** Sorted lex by `id`. */
	readonly producers: readonly IProducerFingerprintEntry[];
}

/**
 * Host-local storage identity. Distinct from the canonical
 * fingerprint on purpose: two machines may have different
 * `IStateStorageIdentity` but the same
 * `ICanonicalProjectFingerprint`.
 */
export interface IStateStorageIdentity {
	readonly repositoryInstanceId: string;
	readonly worktreeId: string;
}

/** Stable JSON serialisation used by `canonicalStateHash`. */
export interface ICanonicalFingerprintShape {
	readonly abiVersion: number;
	readonly producers: ReadonlyArray<{
		readonly id: string;
		readonly producerVersion: number;
		readonly abiVersion: number;
		readonly inputs: ReadonlyArray<{
			readonly kind: IProducerInputKind;
			readonly locator: string;
			readonly digest: Sha256Hex;
			readonly parserVersion?: number;
		}>;
	}>;
}

/* -------------------------------------------------------------- */
/* producer                                                        */
/* -------------------------------------------------------------- */

/**
 * Frozen snapshot of every input a producer declared. The host
 * builds it once per `hydrate()` / `incremental()` call; the
 * producer only reads from it.
 */
export interface IStateInputSnapshot {
	readonly fingerprint: ICanonicalProjectFingerprint;
	/**
	 * Lookup of input content by `IInputKey`. Absent keys mean the
	 * input is empty / undeclared / external.
	 */
	readonly contents: ReadonlyMap<string, Uint8Array>;
	/** Input declaration for diagnostics. */
	readonly declared: ReadonlyArray<IProducerInputSpec>;
	/**
	 * Per-producer resolution of declared specs. Producers never
	 * read from `contents` directly; they consume `ctx.resolved`,
	 * which is filtered to just the producer they serve.
	 */
	readonly byProducer?: ReadonlyMap<
		string,
		readonly IResolvedProducerInput[]
	>;
}

/** One issue reported by a producer's projection validator. */
export interface IProjectionValidationIssue {
	readonly path: string;
	readonly message: string;
}

/** Result of a producer's projection validator. Empty list = valid. */
export interface IProjectionValidationResult {
	readonly issues: readonly IProjectionValidationIssue[];
}

/** Schema validator a producer may declare. */
export type IProjectionValidator = (
	projection: CanonicalProjection,
) => IProjectionValidationResult;

/**
 * A change the engine passes to `reconcile()`. Producers declare
 * their own discriminator.
 */
export interface IStateChange {
	readonly kind: string;
	readonly [k: string]: unknown;
}

/** Result of `rebuild()` / `reconcile()`. */
export interface IProjectionResult {
	readonly canonical: CanonicalProjection;
	/**
	 * Optional raw projection for read consumers that need
	 * non-canonical access. Never part of the canonical hash.
	 */
	readonly raw?: unknown;
}

/**
 * Context passed to a producer when `rebuild()` / `reconcile()` is
 * invoked. Everything the producer needs is here, already resolved
 * by the host — the producer MUST NOT call `process.cwd()`,
 * `fs.readFile` or anything path-dependent that was not injected.
 */
export interface IProducerContext {
	/** Resolved scope (locator already absolute). */
	readonly scope: StateScope;
	/** The canonical fingerprint of the snapshot. */
	readonly fingerprint: ICanonicalProjectFingerprint;
	/** Inputs resolved for THIS producer only (spec + digest + content). */
	readonly resolved: readonly IResolvedProducerInput[];
	/** Optional base projection (only set on `reconcile`). */
	readonly baseProjection?: IProjectionResult;
}

/**
 * Pure projection producer. The engine treats the producer itself
 * as immutable; any state inside the producer object would defeat
 * the determinism property.
 */
export interface IStateProducer {
	readonly id: string;
	/** Producer-declared ABI version. Must equal `STATE_ABI_VERSION`. */
	readonly abiVersion: number;
	/** Producer-declared version (independent of the engine ABI). */
	readonly producerVersion: number;
	/** The scope kinds this producer serves. */
	readonly serves: readonly StateScopeKind[];
	/** STATIC declared inputs (spec only — no digest, no content). */
	readonly inputs: readonly IProducerInputSpec[];
	/** Optional projection validator run after `rebuild` / `reconcile`. */
	readonly validateProjection?: IProjectionValidator;
	/** Pure: build the canonical projection from scratch. */
	rebuild(ctx: IProducerContext): IProjectionResult;
	/** Pure: apply a change to a base projection. */
	reconcile(ctx: IProducerContext, change: IStateChange): IProjectionResult;
	/** Optional hook to normalise a raw projection. */
	canonicalize?(projection: IProjectionResult): CanonicalProjection;
}

/* -------------------------------------------------------------- */
/* generation                                                      */
/* -------------------------------------------------------------- */

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
 * Fencing for the PROJECT scope. Strictly increases every time the
 * active generation changes for a scope.
 */
export type IProjectLeaseToken = number;

/**
 * Fencing for the SWARM scope. Strictly increases every time a slot
 * is reassigned.
 */
export type ISwarmLeaseToken = number;

/**
 * A holder keeps a generation alive past its publication. Holders
 * are refcounted; the GC reaps when the count drops to zero.
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
 * generation is ready to read. `canonicalHash` is purely a
 * function of (fingerprint, projection).
 */
export interface IStateGeneration {
	readonly id: IGenerationId;
	readonly parentId?: IGenerationId;
	/** The canonical fingerprint this generation was built from. */
	readonly fingerprint: ICanonicalProjectFingerprint;
	/** Sha256 of the canonical projection. Pure semantic. */
	readonly canonicalHash: Sha256Hex;
	/** Newly-created generations are `active`. */
	readonly status: IGenerationStatus;
	/** Local observability metadata. Excluded from `canonicalHash`. */
	readonly createdAt: number;
	/** Strictly increasing per-scope; increment on each `publish`. */
	readonly projectLeaseToken: IProjectLeaseToken;
	/** Host-local storage identity. Excluded from `canonicalHash`. */
	readonly storageIdentity: IStateStorageIdentity;
	/** Current count of holders refcounting this generation (derived). */
	readonly holderCount: number;
	/** Marker for drivers that derive `holderCount` from the holders map. */
	readonly _holderCountSource?: 'derived';
}

/**
 * Failure reasons for `hydrate` and `incremental`. The four
 * `state_store_*` reasons describe the **durable layer**, not the
 * in-memory pipeline.
 */
export type IHydrateFailureReason =
	| 'producer_threw'
	| 'fingerprint_mismatch'
	| 'scope_not_supported'
	| 'snapshot_unavailable'
	| 'projection_invalid'
	| 'snapshot_invalid'
	| 'state_store_unavailable'
	| 'state_store_corrupt'
	| 'state_store_schema_unsupported'
	| 'state_store_stale';

/**
 * Drift direction between the durable layer's
 * `reconciled_commit_sha` and the current `HEAD`.
 *
 * - `equal` — the stored SHA matches `HEAD`; use the store as-is.
 * - `behind` — the stored SHA is an ancestor of `HEAD`; an
 *   incremental reconcile is safe.
 * - `ahead` — the stored SHA is a descendant of `HEAD`; the durable
 *   layer is NEWER than the working tree. Full rebuild.
 * - `diverged` — neither SHA is an ancestor of the other. Drop the
 *   store and rebuild.
 */
export type TDriftDirection = 'equal' | 'behind' | 'ahead' | 'diverged';

/**
 * Underlying diagnostic paired with one of the four
 * `state_store_*` reasons.
 */
export interface IStateStoreFailure {
	/** The SQLite / filesystem error code, when applicable. */
	readonly code?: string;
	/**
	 * Output of `PRAGMA integrity_check` for `state_store_corrupt`,
	 * or `PRAGMA user_version` for `state_store_schema_unsupported`.
	 */
	readonly pragma?: string;
	/** The stored `reconciled_commit_sha` at the time of failure. */
	readonly reconciledCommitSha?: string;
	/** The current `HEAD` at the time of failure. */
	readonly headCommitSha?: string;
	/** Drift direction between store and `HEAD` (`state_store_stale`). */
	readonly drift?: TDriftDirection;
	/** The supported schema-version range. */
	readonly supportedSchemaRange?: {
		readonly min: number;
		readonly max: number;
	};
	/** The actual schema-version observed in the store. */
	readonly observedSchemaVersion?: number;
}

/** Result of `hydrate()` and `incremental()`. */
export type IHydrateResult =
	| { readonly ok: true; readonly generation: IStateGeneration }
	| {
			readonly ok: false;
			readonly reason: IHydrateFailureReason;
			readonly detail?: string;
			/** Typed diagnostic for the four `state_store_*` reasons. */
			readonly storeFailure?: IStateStoreFailure;
	  };

/* -------------------------------------------------------------- */
/* registry                                                        */
/* -------------------------------------------------------------- */

/**
 * A lease the registry hands back to a producer for project-level
 * writes. The `leaseId` is unique PER ACQUISITION, so two agents
 * that capture the same `(generationId, token)` obtain distinct
 * lease ids and count as two independent holders.
 */
export interface IProjectLeaseHandle {
	readonly generationId: IGenerationId;
	readonly token: IProjectLeaseToken;
	/** Unique per acquisition; pass to `releaseProjectLease`. */
	readonly leaseId: string;
	/** Release the lease; the generation holder count decrements. */
	release(): void;
}

/**
 * A claim the registry hands back for swarm-level coordination. A
 * swarm claim is bound to the slot (e.g. a slice id), not to a
 * generation; replacing the active generation does NOT invalidate
 * swarm claims.
 */
export interface ISwarmClaimHandle {
	readonly slot: string;
	readonly token: ISwarmLeaseToken;
	/** The token currently in the registry. */
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
			readonly generation: IStateGeneration;
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
	 * freeze contents BEFORE calling `hydrate()`.
	 */
	readonly snapshot: IStateInputSnapshot;
}

/** Single issue from `validateSnapshot`. */
export interface ISnapshotIssue {
	readonly kind:
		| 'producer_missing_inputs'
		| 'producer_orphan_inputs'
		| 'fingerprint_mismatch'
		| 'orphan_contents'
		| 'duplicate_input'
		/** A host's claimed digest must match sha256(content). */
		| 'digest_mismatch';
	readonly producerId?: string;
	readonly key?: string;
	readonly detail?: string;
}

/** Public contract every State Engine driver must satisfy. */
export interface IStateRegistry {
	/**
	 * Register a producer. Refuses ill-formed producers or
	 * duplicates with the same `(id, producerVersion)`.
	 */
	defineProducer(producer: IStateProducer): IStateProducer;

	/**
	 * Hydrate from scratch: read every declared input from the
	 * supplied snapshot, run `rebuild()` on every producer that
	 * serves `scope.kind`, validate, compose, publish.
	 */
	hydrate(input: IHydrateInput): IHydrateResult;

	/**
	 * Apply a change on top of the current active generation. If no
	 * base generation exists, falls back to `hydrate()`.
	 */
	incremental(input: IHydrateInput, change: IStateChange): IHydrateResult;

	/** Read the canonical projection of a producer. */
	lookup(args: {
		readonly scope: StateScope;
		readonly producerId: string;
	}): IReadResult;

	/**
	 * Try to acquire a project-generation lease for a write. Hands
	 * back an `IProjectLeaseHandle` when the supplied
	 * `(generationId, token)` matches the current active
	 * generation; otherwise returns `IFenceRejected`.
	 */
	acquireProjectLease(args: {
		readonly scope: StateScope;
		readonly generationId: IGenerationId;
		readonly token: IProjectLeaseToken;
	}): IProjectLeaseHandle | IFenceRejected;

	/** Release a previously acquired project lease. Idempotent. */
	releaseProjectLease(args: {
		readonly scope: StateScope;
		readonly leaseId: string;
	}): void;

	/**
	 * Claim a swarm slot. Two concurrent claims on the same slot
	 * with the same token return distinct tokens (second wins).
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
	 * reaped) for every scope.
	 */
	diagnose(): readonly IStateGeneration[];

	/**
	 * Compute the canonical fingerprint of the registered
	 * producers. Accepts a host-supplied `byProducer` map so a
	 * snapshot's fingerprint can be computed without depending on
	 * which driver is in use.
	 */
	seedFingerprint(
		resolved?: ReadonlyMap<string, readonly IResolvedProducerInput[]>,
	): ICanonicalProjectFingerprint;

	/**
	 * Validate a host-supplied snapshot against the registered
	 * producers. The facade concatenates the two halves below.
	 */
	validateSnapshot(snapshot: IStateInputSnapshot): readonly ISnapshotIssue[];

	/** Self-consistency half of `validateSnapshot`. */
	validateSnapshotIntegrity(
		snapshot: IStateInputSnapshot,
	): readonly ISnapshotIssue[];

	/** Registry-comparison half of `validateSnapshot`. */
	validateSnapshotAgainstRegistry(
		snapshot: IStateInputSnapshot,
		scope?: StateScope,
	): readonly ISnapshotIssue[];

	/** Tear down for tests. */
	resetForTests(): void;
}

/** Clock injected for testability. Production hosts pass `() => Date.now()`. */
export type IStateClock = () => number;

/** Options shared by every driver. */
export interface IStateRegistryOptions {
	readonly clock: IStateClock;
}

/** Convenience: the JSON-safe base type used by canonical projection. */
export type IProjectionRoot = CanonicalJsonValue;
