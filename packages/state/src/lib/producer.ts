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
	ICanonicalProjectFingerprint,
	IInputKey,
	IProducerFingerprintEntry,
	IProducerInput,
	IProducerInputKind,
	IProducerInputSpec,
} from './fingerprint';
import { canonicalizeResolvedInputs } from './fingerprint';
import type { IResolvedProducerInput } from './fingerprint';
export type { IInputKey, IResolvedProducerInput } from './fingerprint';
import type { StateScope } from './scope';

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
	readonly fingerprint: ICanonicalProjectFingerprint;
	/**
	 * Lookup of input content by `IInputKey`. Absent keys mean the
	 * input is empty / undeclared / external. The keys here MUST
	 * belong to exactly the union of `byProducer`'s keys (across
	 * every producer) — `validateSnapshot` enforces this.
	 */
	readonly contents: ReadonlyMap<string, Uint8Array>;
	/**
	 * Input declaration for diagnostics. Producers usually do not
	 * need this in `rebuild()` / `reconcile()` but they may want
	 * it to report which input came from where.
	 */
	readonly declared: ReadonlyArray<IProducerInputSpec>;
	/**
	 * Phase 0.2: per-producer resolution of declared specs. The
	 * host MUST populate this map from the producer's declared
	 * specs + the freshly resolved digests. Producers never read
	 * from `contents` directly; they consume `ctx.resolved` which
	 * is filtered to just the producer they serve.
	 *
	 * This scoping is what fixes chatgpt S3: a producer can no
	 * longer observe inputs declared by another producer (which
	 * was previously possible via the shared `contents` map).
	 *
	 * Entries carry the resolved digest next to the spec so the
	 * driver can build `ctx.resolved` and the fingerprint without
	 * a second lookup.
	 *
	 * Optional for backward-compat with hand-rolled test
	 * snapshots; drivers MUST treat an empty/absent map as
	 * "no per-producer resolution", and `validateSnapshot`
	 * treats it as "no declared inputs to check".
	 */
	readonly byProducer?: ReadonlyMap<
		string,
		readonly IResolvedProducerInput[]
	>;
}

/** Empty per-producer bucket, used when hosts opt out of scoping. */
export const EMPTY_BY_PRODUCER: ReadonlyMap<
	string,
	readonly IResolvedProducerInput[]
> = new Map();

/** Resolve an `IInputKey` to its canonical string form. */
export function inputKeyString(key: IInputKey): string {
	const pv = key.parserVersion ?? '';
	return `${key.kind}|${key.locator}|${pv}`;
}

/** Convenience: build an `IInputKey` from an `IProducerInput`. */
// Re-export IProducerInput / IProducerInputKind so plugin consumers
// can import everything from '@delendai/state/producer' alone.
export type { IProducerInput, IProducerInputKind } from './fingerprint';
export function inputKeyOf(input: IProducerInputSpec): IInputKey {
	const base: {
		kind: IProducerInputKind;
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

export type IProjectionValidator = (
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
export interface IProjectionResult {
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
 *
 * Phase 0.2 (x00502 S1): the producer no longer sees the global
 * `IStateInputSnapshot`. It receives `resolved` — ONLY the
 * inputs `byProducer` attributes to THIS producer. A producer
 * cannot observe inputs declared by another producer because
 * the field does not exist on its context.
 */
export interface ProducerContext {
	/** Resolved scope (locator already absolute). */
	readonly scope: StateScope;
	/** The canonical fingerprint of the snapshot. */
	readonly fingerprint: ICanonicalProjectFingerprint;
	/**
	 * Inputs resolved for THIS producer only (spec + digest +
	 * content). Filtered from `IStateInputSnapshot.byProducer`
	 * by the driver before the producer runs.
	 */
	readonly resolved: readonly IResolvedProducerInput[];
	/**
	 * Optional base projection (only set on `reconcile`). The
	 * producer MAY short-circuit by returning this unchanged when
	 * the change list is empty for its slice.
	 */
	readonly baseProjection?: IProjectionResult;
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
	 * STATIC declared inputs (spec only — no digest, no content).
	 * Phase 0.2 (x00502 S2): the producer declares WHAT it
	 * depends on; the host resolves the digest + bytes per
	 * snapshot and hands them back via `ctx.resolved`. The
	 * registry fingerprint derives from spec + resolved digest,
	 * never from a frozen digest captured at registration.
	 *
	 * The fingerprint normalises the order via the canonical sort
	 * in `fingerprint.ts`, so two producers that declare the same
	 * inputs in different orders still produce the same canonical
	 * fingerprint.
	 */
	readonly inputs: readonly IProducerInputSpec[];
	/**
	 * Optional projection validator. The engine calls it after
	 * `rebuild()` / `reconcile()` and refuses to publish when the
	 * result is non-empty. When undefined, validation is skipped.
	 */
	readonly validateProjection?: IProjectionValidator;
	/**
	 * Pure: build the canonical projection from scratch.
	 * `ctx.resolved` carries every input attributed to this
	 * producer + the host-verified digests.
	 */
	rebuild(ctx: ProducerContext): IProjectionResult;
	/**
	 * Pure: apply a change to a base projection. Returns the new
	 * canonical projection. Must be deterministic given the same
	 * inputs and the same change.
	 */
	reconcile(ctx: ProducerContext, change: IStateChange): IProjectionResult;
	/**
	 * Optional hook the engine calls to normalise a raw projection
	 * (e.g. coerce stringly-typed numbers, sort arrays). Default
	 * implementation returns `projection.canonical` unchanged.
	 */
	canonicalize?(projection: IProjectionResult): CanonicalProjection;
}

/**
 * Default `canonicalize` (return the projection as-is).
 */
export function defaultCanonicalize(p: IProjectionResult): CanonicalProjection {
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
 *
 * Phase 0.2 (x00502 S2): ownership is STRUCTURAL metadata — the
 * resolver says which producer each input belongs to. The
 * legacy `@producerId/...` locator-prefix hack is gone: a
 * locator is just a path/glob/id and never encodes ownership.
 */
export interface IResolvedInput {
	/** The producer this resolved input belongs to. */
	readonly producerId: string;
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
	fingerprint: ICanonicalProjectFingerprint,
): IStateInputSnapshot {
	const contents = new Map<string, Uint8Array>();
	const declared: IProducerInputSpec[] = [];
	const byProducer = new Map<string, IResolvedProducerInput[]>();
	for (const r of resolved) {
		const key = inputKeyString(inputKeyOf(r.input));
		contents.set(key, r.content);
		const { digest, ...spec } = r.input;
		void digest;
		declared.push(spec);
		const entry: IResolvedProducerInput = {
			spec,
			digest: r.input.digest,
			content: r.content,
		};
		const bucket = byProducer.get(r.producerId);
		if (bucket === undefined) {
			byProducer.set(r.producerId, [entry]);
		} else {
			bucket.push(entry);
		}
	}
	return { fingerprint, contents, declared, byProducer };
}

/**
 * Helper: derive a fingerprint entry from a producer's declared
 * specs + the host-resolved digests. Phase 0.2 (x00502 S2): the
 * fingerprint is computed from the RESOLVED snapshot, never from
 * the bare static spec list.
 */
export function fingerprintEntryOf(
	p: IStateProducer,
	resolved: readonly IResolvedProducerInput[] = [],
): IProducerFingerprintEntry {
	return {
		id: p.id,
		producerVersion: p.producerVersion,
		abiVersion: p.abiVersion,
		inputs: canonicalizeResolvedInputs(resolved),
	};
}

/** Helper: build a canonical fingerprint from a list of producers. */
export function fingerprintFromProducers(
	producers: readonly IStateProducer[],
	abiVersion: number,
	resolvedByProducer?: ReadonlyMap<string, readonly IResolvedProducerInput[]>,
): ICanonicalProjectFingerprint {
	return {
		abiVersion,
		producers: producers.map((p) =>
			fingerprintEntryOf(p, resolvedByProducer?.get(p.id) ?? []),
		),
	};
}

/** Helper used by the driver + tests to derive a canonical payload object. */
export function canonicalProjectionRoot<
	T extends { readonly kind: string } & Record<string, unknown>,
>(value: T): CanonicalJsonValue {
	return value as unknown as CanonicalJsonValue;
}
