/**
 * fingerprint.ts — fingerprints, distinct from storage identity.
 *
 * q00018 Phase 0.2. Two flavours of fingerprint, intentionally
 * NOT mixed:
 *
 *   - `ICanonicalProjectFingerprint` — the semantic fingerprint of
 *     a project's state. Computed from the State ABI + every
 *     producer's `producerVersion` + every RESOLVED input
 *     digest. Two machines with the same
 *     `ICanonicalProjectFingerprint` MUST produce the same
 *     `canonicalStateHash` (convergence). NEVER depends on
 *     absolute path, branch, hostname, mtime, `Date.now`, PID,
 *     environment variables, or any non-deterministic source.
 *
 *   - `IStateStorageIdentity` — the host's local storage identity.
 *     Carries the `RepositoryInstanceId` + `WorktreeId` so the
 *     engine knows WHICH on-disk / in-memory slot to read and
 *     write. Never contributes to `canonicalStateHash`.
 *
 * Phase 0.2 split (chatgpt review, 2026-09-06):
 *
 *   - `IProducerInputSpec` — STATIC, declared by the producer on
 *     registration. Just `kind` + `locator` + optional
 *     `parserVersion`. Stable across rebuilds.
 *
 *   - `IResolvedProducerInput` — DYNAMIC, computed by the host
 *     for the current snapshot. Carries the `digest` + bytes
 *     `content` BESIDES the spec. The fingerprint derives from
 *     `spec.key + digest`. This is what Phase 0.1 missed: the
 *     fingerprint must be computed from the resolved snapshot,
 *     NOT from the producer's static spec list (otherwise the
 *     fingerprint stays "the same" even when the file changes,
 *     silently producing stale state).
 *
 *   - `IProducerInput` — kept as a flat alias of
 *     `IProducerInputSpec & { digest }` so legacy Phase 0.1
 *     consumers still compile. New code SHOULD prefer the
 *     spec / resolved split above.
 *
 * Inputs are canonicalised as a SET before the fingerprint is
 * computed: two producers that declare the same inputs in
 * different orders MUST produce the same fingerprint.
 */

import type { Sha256Hex } from './hash';

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
 * `IStateInputSnapshot.byProducer` lookup key. Two specs with
 * the same key represent the same logical input.
 */
export interface IInputKey {
	readonly kind: IProducerInputKind;
	readonly locator: string;
	readonly parserVersion?: number;
}

/**
 * Static declaration of an input a producer depends on.
 * Phase 0.2: this is the shape a producer declares at
 * registration. It has NO digest, NO content — those are
 * resolved by the host per snapshot.
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
 * fingerprint derives from `spec + digest`; `content` is what
 * the producer reads inside `rebuild` / `reconcile`.
 */
export interface IResolvedProducerInput {
	readonly spec: IProducerInputSpec;
	/** Lower-case hex sha256 of the input's content (or its listing). */
	readonly digest: Sha256Hex;
	/** Concrete bytes for the current snapshot. May be empty for `opaque`. */
	readonly content: Uint8Array;
}

/**
 * Legacy flat input kept for Phase 0.1 compat. New code MUST
 * use the spec/resolved split.
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
	 * Canonicalised SET of inputs (resolved). The fingerprint treats
	 * `{A, B}` and `{B, A}` as the same producer; the canonical
	 * serialisation sorts them.
	 */
	readonly inputs: readonly IProducerInput[];
}

/**
 * The semantic fingerprint of a project. Same fingerprint =>
 * same canonical state. Different fingerprints MAY yield the
 * same canonical state (a producer can be non-injective), but
 * the equivalence holds in the direction "same inputs => same
 * hash".
 *
 * NEVER includes the storage identity, the host name, the
 * working directory, or any non-deterministic source.
 */
export interface ICanonicalProjectFingerprint {
	readonly abiVersion: number;
	/** Sorted lex by `id`. */
	readonly producers: readonly IProducerFingerprintEntry[];
}

/**
 * Host-local storage identity. Distinct from the canonical
 * fingerprint on purpose: two machines may have different
 * `IStateStorageIdentity` (different repoInstanceId, different
 * worktreeId) but the same `ICanonicalProjectFingerprint`.
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

/**
 * The stable string form of a `IProducerInputSpec`. Used as the
 * canonical lookup key into an `IStateInputSnapshot`.
 */
export function inputSpecKey(spec: IProducerInputSpec): string {
	const pv = spec.parserVersion ?? '';
	return `${spec.kind}|${spec.locator}|${pv}`;
}

/** Build an `IInputKey` from a `IProducerInputSpec`. */
export function inputKeyOfSpec(spec: IProducerInputSpec): IInputKey {
	if (spec.parserVersion === undefined) {
		return { kind: spec.kind, locator: spec.locator };
	}
	return {
		kind: spec.kind,
		locator: spec.locator,
		parserVersion: spec.parserVersion,
	};
}

/**
 * Phase 0.2: build a canonical fingerprint from the REGISTRY'S
 * registered producer specs + the host's RESOLVED inputs.
 *
 * This is the function the driver uses INSIDE `hydrate` /
 * `incremental` to (a) verify the host's snapshot matches the
 * registry's understanding, and (b) compute the canonical hash
 * honestly — never trusting the host's pre-built fingerprint
 * alone. The static spec list says WHAT the producer expects;
 * the resolved input list says WHAT the snapshot actually
 * contains; this function folds both into the fingerprint.
 *
 * A pure spec list returns `inputs: []` — that is allowed
 * (producers can declare no inputs at all). A resolved input
 * list with `spec.key` not present in the producer's declared
 * specs is treated as an error by `validateSnapshot` (separate
 * function), not here.
 */
export function fingerprintFromResolved(
	abiVersion: number,
	resolved: ReadonlyMap<string, readonly IResolvedProducerInput[]>,
): ICanonicalProjectFingerprint {
	const entries: IProducerFingerprintEntry[] = [];
	const producerIds = Array.from(resolved.keys()).sort();
	for (const id of producerIds) {
		const list = resolved.get(id) ?? [];
		// Use the first resolved item's spec to obtain abiVersion
		// + producerVersion metadata. ALL resolved items belong to
		// the same producer + same producerVersion (validated
		// upstream); if not, the sort below surfaces the drift.
		const sortedSpecs = canonicalizeResolvedInputs(list);
		if (sortedSpecs.length === 0) continue;
		// We do not have `producerVersion` in IResolvedProducerInput;
		// the registry attaches that metadata outside. The
		// fingerprint stays the host's responsibility for ABI level
		// only.
		entries.push({
			id,
			producerVersion: 0, // resolved by registry-level metadata
			abiVersion,
			inputs: sortedSpecs,
		});
	}
	return { abiVersion, producers: entries };
}

/**
 * Phase 0.2 helper: convert a `IResolvedProducerInput[]` to the
 * flat `IProducerInput[]` form (sorted set, digest included) so
 * the canonical fingerprint machinery stays single-source.
 */
export function canonicalizeResolvedInputs(
	resolved: readonly IResolvedProducerInput[],
): readonly IProducerInput[] {
	const flat: IProducerInput[] = resolved.map((r) => {
		const base: IProducerInputSpec = {
			kind: r.spec.kind,
			locator: r.spec.locator,
			...(r.spec.parserVersion === undefined
				? {}
				: { parserVersion: r.spec.parserVersion }),
		};
		return { ...base, digest: r.digest };
	});
	return sortInputs(flat);
}

/**
 * Sort an inputs array canonically. Two inputs are considered
 * the same iff kind + locator + parserVersion match (regardless
 * of digest). The digest is intentionally NOT part of equality
 * — two equivalent inputs with different digests is a host
 * bug, and we want the fingerprint to highlight it.
 */
export function sortInputs(
	inputs: readonly IProducerInput[],
): readonly IProducerInput[] {
	const sorted = [...inputs].sort(compareInputKey);
	return sorted.map((i) => stripUndefinedParserVersion(i));
}

/**
 * Sort producers canonically. Producers are compared by `id`
 * (lexicographic, ascending) so the fingerprint is independent
 * of registration order.
 */
export function canonicalizeProducers(
	producers: readonly IProducerFingerprintEntry[],
): readonly IProducerFingerprintEntry[] {
	const sorted = [...producers].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	return sorted.map((p) => ({
		id: p.id,
		producerVersion: p.producerVersion,
		abiVersion: p.abiVersion,
		inputs: sortInputs(p.inputs),
	}));
}

/** Compare two inputs by their canonical key. */
export function compareInputKey(a: IProducerInput, b: IProducerInput): number {
	if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
	if (a.locator !== b.locator) return a.locator < b.locator ? -1 : 1;
	const ap = a.parserVersion ?? -1;
	const bp = b.parserVersion ?? -1;
	if (ap !== bp) return ap - bp;
	return 0;
}

function stripUndefinedParserVersion(i: IProducerInput): IProducerInput {
	if (i.parserVersion === undefined) return i;
	return {
		kind: i.kind,
		locator: i.locator,
		digest: i.digest,
		parserVersion: i.parserVersion,
	};
}

/**
 * Build the canonical shape used by the canonical hash. The
 * fields are sorted (producers by id, inputs by canonical key).
 */
export function toCanonicalFingerprintShape(
	fp: ICanonicalProjectFingerprint,
): ICanonicalFingerprintShape {
	const sortedProducers = canonicalizeProducers(fp.producers);
	return {
		abiVersion: fp.abiVersion,
		producers: sortedProducers.map((p) => ({
			id: p.id,
			producerVersion: p.producerVersion,
			abiVersion: p.abiVersion,
			inputs: p.inputs.map((i) =>
				i.parserVersion === undefined
					? { kind: i.kind, locator: i.locator, digest: i.digest }
					: {
							kind: i.kind,
							locator: i.locator,
							digest: i.digest,
							parserVersion: i.parserVersion,
						},
			),
		})),
	};
}

/**
 * Compare two canonical fingerprints structurally. The order of
 * producers and inputs is normalised by `canonicalizeProducers`
 * before comparison.
 */
export function fingerprintEqual(
	a: ICanonicalProjectFingerprint,
	b: ICanonicalProjectFingerprint,
): boolean {
	if (a.abiVersion !== b.abiVersion) return false;
	const ca = canonicalizeProducers(a.producers);
	const cb = canonicalizeProducers(b.producers);
	if (ca.length !== cb.length) return false;
	for (let i = 0; i < ca.length; i += 1) {
		const pa = ca[i] as IProducerFingerprintEntry;
		const pb = cb[i] as IProducerFingerprintEntry;
		if (pa.id !== pb.id) return false;
		if (pa.producerVersion !== pb.producerVersion) return false;
		if (pa.abiVersion !== pb.abiVersion) return false;
		const ka = sortInputs(pa.inputs);
		const kb = sortInputs(pb.inputs);
		if (ka.length !== kb.length) return false;
		for (let j = 0; j < ka.length; j += 1) {
			const ia = ka[j] as IProducerInput;
			const ib = kb[j] as IProducerInput;
			if (ia.kind !== ib.kind) return false;
			if (ia.locator !== ib.locator) return false;
			if (ia.digest !== ib.digest) return false;
			if ((ia.parserVersion ?? null) !== (ib.parserVersion ?? null)) {
				return false;
			}
		}
	}
	return true;
}

/** Stable constant for the State ABI of `@delendai/state` v0.1.x. */
export const STATE_ABI_VERSION = 1 as const;
