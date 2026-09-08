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

/**
 * x00530 S1: the producer TYPE surface moved to
 * `@delendai/contracts/state` (transitive closure of
 * `IStateRegistry`, which `@delendai/core` publishes on its plugin
 * contract). The runtime helpers stay here; the types are
 * re-exported verbatim so every existing `@delendai/state/producer`
 * import keeps resolving.
 */
import type {
	CanonicalJsonValue,
	CanonicalProjection,
	ICanonicalProjectFingerprint,
	IInputKey,
	IProducerFingerprintEntry,
	IProducerInput,
	IStateInputSnapshot,
	IProducerInputKind,
	IProducerInputSpec,
	IProjectionResult,
	IResolvedProducerInput,
	IStateProducer,
} from '@delendai/contracts/state';
import { canonicalizeResolvedInputs } from './fingerprint';

export type {
	CanonicalJsonValue,
	CanonicalProjection,
	IInputKey,
	IResolvedProducerInput,
	IProducerInput,
	IProducerInputKind,
	IProducerInputSpec,
	IStateInputSnapshot,
	IProjectionValidationIssue,
	IProjectionValidationResult,
	IProjectionValidator,
	IStateChange,
	IProjectionResult,
	ProducerContext,
	IStateProducer,
} from '@delendai/contracts/state';

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
