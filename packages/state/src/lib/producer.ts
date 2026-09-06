/**
 * producer.ts — `IStateProducer` + input snapshot + schema hooks.
 *
 * q00018 Phase 0.1. The contract a producer implements.
 *
 * Three things changed from Phase 0:
 *
 *   1. `IStateInputSnapshot` — a frozen, host-supplied bundle of
 *      inputs. Producers no longer reach for `fs` indirectly; the
 *      host computes the digests once, freezes the snapshot, and
 *      hands it in. This also avoids the TOCTOU race
 *      "compute digest then read content".
 *
 *   2. `projectionSchema?` + `validateProjection?` — when the
 *      producer wants schema validation (Phase 1 / SQLite will
 *      use it to detect migrations and corrupt projections), it
 *      declares it. The state engine calls it after every
 *      `rebuild` / `reconcile`. A producer without a schema
 *      skips validation.
 *
 *   3. Producers MUST NOT touch non-deterministic sources
 *      (`Date.now`, `Math.random`, `crypto.randomBytes`,
 *      `process.env`, ...). The lint
 *      `tools/scripts/lint/no-node-imports-in-state.script.ts`
 *      enforces the boundary statically for `@delendai/state`
 *      itself; `tools/scripts/lint/state-engine-purity.script.ts`
 *      extends the boundary to producers under
 *      `plugins[star]/src/lib/state/[star][star]` (the lint scans there).
 *
 *   4. `canonicalizeInputOrder` was retired in favour of the
 *      canonical sort inside `fingerprint.ts`; producers do NOT
 *      need to canonicalise locally.
 */

import type { CanonicalJsonValue, CanonicalProjection } from './hash';
import type {
	CanonicalProjectFingerprint,
	IProducerFingerprintEntry,
	IProducerInput,
	ProducerInputKind,
} from './fingerprint';
import type { StateScope } from './scope';

/**
 * Canonical key for an input. Use it as the Map key in
 * `IStateInputSnapshot.contents`.
 */
export interface IInputKey {
	readonly kind: ProducerInputKind;
	readonly locator: string;
	readonly parserVersion?: number;
}

/**
 * Frozen snapshot of every input a producer declared. The host
 * builds it once per `hydrate()` / `incremental()` call; the
 * producer only reads from it.
 *
 * `fingerprint` is the canonical fingerprint of the SAME inputs.
 * Fingerprint and content MUST belong to the same logical
 * snapshot — producers that compare the digest of a content byte
 * against the fingerprint digest will detect a host bug.
 */
export interface IStateInputSnapshot {
	readonly fingerprint: CanonicalProjectFingerprint;
	/**
	 * Lookup of input content by `IInputKey`. Absent keys mean the
	 * input is empty / undeclared / external.
	 */
	readonly contents: ReadonlyMap<string, Uint8Array>;
	/**
	 * Input declaration for diagnostics. Producers usually do not
	 * need this in `rebuild()` / `reconcile()` but they may want
	 * it to report which input came from where.
	 */
	readonly declared: ReadonlyArray<IProducerInput>;
}

/** Resolve an `IInputKey` to its canonical string form. */
export function inputKeyString(key: IInputKey): string {
	const pv = key.parserVersion ?? '';
	return `${key.kind}|${key.locator}|${pv}`;
}

/** Convenience: build an `IInputKey` from an `IProducerInput`. */
// Re-export IProducerInput / ProducerInputKind so plugin consumers
// can import everything from '@delendai/state/producer' alone.
export type { IProducerInput, ProducerInputKind } from './fingerprint';
export function inputKeyOf(input: IProducerInput): IInputKey {
	const base: {
		kind: ProducerInputKind;
		locator: string;
		parserVersion?: number;
	} =
		input.parserVersion === undefined
			? { kind: input.kind, locator: input.locator }
			: {
					kind: input.kind,
					locator: input.locator,
					parserVersion: input.parserVersion,
				};
	return base;
}

/**
 * Schema validator the producer may declare. Returns a list of
 * issues; empty list = valid. The registry records the validator
 * output and refuses to publish a generation with non-empty
 * issues when the producer is strict (the default).
 */
export interface IProjectionValidationIssue {
	readonly path: string;
	readonly message: string;
}

export interface IProjectionValidationResult {
	readonly issues: readonly IProjectionValidationIssue[];
}

export type ProjectionValidator = (
	projection: CanonicalProjection,
) => IProjectionValidationResult;

/**
 * A change the engine passes to `reconcile()`. Producers declare
 * their own discriminator; the registry forwards the change to
 * every producer serving the scope.
 */
export interface IStateChange {
	readonly kind: string;
	readonly [k: string]: unknown;
}

/** Result of `rebuild()` / `reconcile()`. */
export interface ProjectionResult {
	readonly canonical: CanonicalProjection;
	/**
	 * Optional raw projection for read consumers that need
	 * non-canonical access (e.g. field-by-field queries). The
	 * engine never uses this for the canonical hash.
	 */
	readonly raw?: unknown;
}

/**
 * Context passed to a producer when `rebuild()` / `reconcile()` is
 * invoked. Everything the producer needs is here, already
 * resolved by the host — the producer MUST NOT call
 * `process.cwd()`, `fs.readFile` or anything path-dependent
 * that has not been injected.
 */
export interface ProducerContext {
	/** Resolved scope (locator already absolute). */
	readonly scope: StateScope;
	/** The canonical fingerprint of the snapshot. */
	readonly fingerprint: CanonicalProjectFingerprint;
	/** Frozen input contents. */
	readonly snapshot: IStateInputSnapshot;
	/**
	 * Optional base projection (only set on `reconcile`). The
	 * producer MAY short-circuit by returning this unchanged when
	 * the change list is empty for its slice.
	 */
	readonly baseProjection?: ProjectionResult;
}

/**
 * Pure projection producer. The engine treats the producer
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
	readonly serves: readonly import('./scope').StateScopeKind[];
	/**
	 * Declared inputs. The engine hashes these into the
	 * fingerprint. Adding/removing/changing a digest is a
	 * fingerprint change ⇒ new canonical state.
	 *
	 * The fingerprint normalises the order via
	 * `canonicalizeInputs`, so two producers that declare the
	 * same inputs in different orders still produce the same
	 * canonical fingerprint.
	 */
	readonly inputs: readonly IProducerInput[];
	/**
	 * Optional projection validator. The engine calls it after
	 * `rebuild()` / `reconcile()` and refuses to publish when the
	 * result is non-empty. When undefined, validation is skipped.
	 */
	readonly validateProjection?: ProjectionValidator;
	/**
	 * Pure: build the canonical projection from scratch.
	 * `snapshot` carries every declared input + the host-verified
	 * digests.
	 */
	rebuild(ctx: ProducerContext): ProjectionResult;
	/**
	 * Pure: apply a change to a base projection. Returns the new
	 * canonical projection. Must be deterministic given the same
	 * inputs and the same change.
	 */
	reconcile(ctx: ProducerContext, change: IStateChange): ProjectionResult;
	/**
	 * Optional hook the engine calls to normalise a raw projection
	 * (e.g. coerce stringly-typed numbers, sort arrays). Default
	 * implementation returns `projection.canonical` unchanged.
	 */
	canonicalize?(projection: ProjectionResult): CanonicalProjection;
}

/**
 * Default `canonicalize` (return the projection as-is).
 */
export function defaultCanonicalize(p: ProjectionResult): CanonicalProjection {
	return p.canonical;
}

/**
 * Type guard: a producer is well-formed iff it declares the
 * current `STATE_ABI_VERSION`, a non-empty id, at least one scope
 * kind, and has `rebuild` and `reconcile` functions.
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

/**
 * Snapshot entry shape produced by a host resolver. The host
 * bundles these into an `IStateInputSnapshot` (see
 * `IStateInputSnapshot`).
 */
export interface IResolvedInput {
	readonly input: IProducerInput;
	readonly content: Uint8Array;
}

/**
 * Build a fingerprint-projection pair from a list of resolved
 * inputs. Pure helper used by the in-memory driver; the SQLite
 * driver (Phase 1) will reuse the same logic.
 */
export function buildSnapshot(
	resolved: readonly IResolvedInput[],
	fingerprint: CanonicalProjectFingerprint,
): IStateInputSnapshot {
	const contents = new Map<string, Uint8Array>();
	const declared: IProducerInput[] = [];
	for (const r of resolved) {
		contents.set(inputKeyString(inputKeyOf(r.input)), r.content);
		declared.push(r.input);
	}
	return { fingerprint, contents, declared };
}

/** Helper: derive a fingerprint entry from a producer's declared inputs. */
export function fingerprintEntryOf(
	p: IStateProducer,
): IProducerFingerprintEntry {
	return {
		id: p.id,
		producerVersion: p.producerVersion,
		abiVersion: p.abiVersion,
		inputs: p.inputs,
	};
}

/** Helper: build a canonical fingerprint from a list of producers. */
export function fingerprintFromProducers(
	producers: readonly IStateProducer[],
	abiVersion: number,
): CanonicalProjectFingerprint {
	return {
		abiVersion,
		producers: producers.map(fingerprintEntryOf),
	};
}

/** Helper used by the driver + tests to derive a canonical payload object. */
export function canonicalProjectionRoot<
	T extends { readonly kind: string } & Record<string, unknown>,
>(value: T): CanonicalJsonValue {
	return value as unknown as CanonicalJsonValue;
}
