/**
 * producer.ts — `IStateProducer` and `IProducerContext`.
 *
 * q00018 Phase 0 S2. A producer is the unit of deterministic
 * projection in the State Engine. It declares:
 *
 *   - which scope kinds it serves
 *   - which inputs it consumes (the engine hashes these into the
 *     fingerprint)
 *   - how to rebuild from scratch (pure: reads declared inputs,
 *     returns a canonical projection)
 *   - how to apply an incremental change (pure: reads declared
 *     inputs + the base projection + the change, returns the new
 *     canonical projection)
 *   - how to canonicalize its raw projection (strip local
 *     metadata, normalise key order)
 *
 * Producers MUST NOT:
 *   - mutate source (Markdown, code, durable config)
 *   - read the wall clock (`Date.now()`), `Math.random()`,
 *     `crypto.randomBytes()` or any non-deterministic source
 *   - import Node-only modules (the package is contract-only)
 *
 * The lint `tools/scripts/lint/state-engine-purity.script.ts`
 * enforces the third rule statically; the determinism property
 * test enforces the second dynamically.
 */

import type { IProducerInput, ProjectFingerprint } from './fingerprint';
import type { CanonicalProjection } from './hash';
import type { IStateScope, StateScopeKind } from './scope';

/**
 * A change the engine passes to `reconcile()`. The shape is left
 * open so producers can declare their own discriminator (e.g.
 * `{ kind: 'proposal-frontmatter-changed', path, oldDigest,
 * newDigest }`). The registry preserves the change in the
 * fingerprint only via the producer's input digests; the change
 * itself never enters the canonical hash.
 */
export interface IStateChange {
	readonly kind: string;
	readonly [k: string]: unknown;
}

/** Result of `rebuild()` / `reconcile()`. */
export interface IProjectionResult {
	/**
	 * Canonical projection. The engine computes the
	 * `canonicalStateHash` over it via `canonicalStateHash`.
	 */
	readonly canonical: CanonicalProjection;
	/**
	 * Optional raw projection for read consumers that need
	 * non-canonical access (e.g. field-by-field queries). MUST
	 * NOT be used by the engine to compute the hash.
	 */
	readonly raw?: unknown;
}

/**
 * Context passed to a producer when `rebuild()` / `reconcile()` is
 * invoked. Everything the producer needs is here, already
 * resolved by the host — the producer MUST NOT call
 * `process.cwd()`, `fs.readFile` or anything path-dependent that
 * has not been injected.
 */
export interface IProducerContext {
	/** Resolved scope (locator already absolute). */
	readonly scope: IStateScope;
	/** The fingerprint of the current rebuild — proves convergence. */
	readonly fingerprint: ProjectFingerprint;
	/**
	 * Resolved input contents. For each `IProducerInput` declared
	 * by the producer, the engine hands back the content bytes or
	 * the pre-computed listing the producer asked for.
	 */
	readonly inputContents: ReadonlyMap<string, Uint8Array>;
	/**
	 * Optional base projection (only set on `reconcile`). The
	 * producer MAY short-circuit by returning this unchanged when
	 * the change list is empty for its slice.
	 */
	readonly baseProjection?: IProjectionResult;
}

/**
 * A pure projection producer. The engine treats the producer
 * itself as immutable; any state inside the producer object
 * would defeat the determinism property.
 */
export interface IStateProducer {
	readonly id: string;
	/** Producer-declared ABI version. Must equal `STATE_ABI_VERSION`. */
	readonly abiVersion: number;
	/** Producer-declared version (independent of the engine ABI). */
	readonly producerVersion: number;
	/** The scope kinds this producer serves. */
	readonly serves: readonly StateScopeKind[];
	/**
	 * Declared inputs. The engine hashes these into the
	 * fingerprint. Adding/removing/changing a digest here is a
	 * fingerprint change ⇒ new canonical state.
	 */
	readonly inputs: readonly IProducerInput[];
	/**
	 * Pure: build the canonical projection from scratch.
	 * `inputContents` carries every declared input.
	 */
	rebuild(ctx: IProducerContext): IProjectionResult;
	/**
	 * Pure: apply a change to a base projection. Returns the new
	 * canonical projection. Must be deterministic given the same
	 * inputs.
	 */
	reconcile(ctx: IProducerContext, change: IStateChange): IProjectionResult;
	/**
	 * Optional hook the engine calls to normalise a raw projection
	 * (e.g. coerce stringly-typed numbers, sort arrays). Default
	 * implementation returns `projection.canonical` unchanged.
	 */
	canonicalize?(projection: IProjectionResult): CanonicalProjection;
}

/** Helper that adapts a producer's `canonicalize` to a default. */
export function defaultCanonicalize(p: IProjectionResult): CanonicalProjection {
	return p.canonical;
}

/**
 * Type guard: a producer is well-formed iff it declares the
 * current `STATE_ABI_VERSION` and at least one scope kind. The
 * registry refuses ill-formed producers at registration time.
 */
export function isProducerWellFormed(
	p: IStateProducer,
	abiVersion: number,
): boolean {
	if (p.abiVersion !== abiVersion) return false;
	if (p.id.length === 0) return false;
	if (p.serves.length === 0) return false;
	if (typeof p.rebuild !== 'function') return false;
	if (typeof p.reconcile !== 'function') return false;
	return true;
}
