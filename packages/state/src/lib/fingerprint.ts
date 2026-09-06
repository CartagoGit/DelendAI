/**
 * fingerprint.ts — fingerprints, distinct from storage identity.
 *
 * q00018 Phase 0.1. Two flavours of fingerprint, intentionally
 * NOT mixed:
 *
 *   - `CanonicalProjectFingerprint` — the semantic fingerprint of
 *     a project's state. Computed from the State ABI + every
 *     producer's `producerVersion` + every declared input. Two
 *     machines with the same `CanonicalProjectFingerprint` MUST
 *     produce the same `canonicalStateHash` (convergence). NEVER
 *     depends on absolute path, branch, hostname, mtime,
 *     `Date.now`, PID, environment variables, or any
 *     non-deterministic source.
 *
 *   - `StateStorageIdentity` — the host's local storage identity.
 *     Carries the `RepositoryInstanceId` + `WorktreeId` so the
 *     engine knows WHICH on-disk / in-memory slot to read and
 *     write. Never contributes to `canonicalStateHash`.
 *
 * The previous Phase 0 mixed the two by setting `defaultSalt =
 * workspace.root` in `assemble.ts`, which made `wsA != wsB`
 * whenever two machines cloned the same repo under different
 * paths. That was an architectural bug — the canonical hash MUST
 * NOT depend on the local path. The fix is to compute the
 * canonical fingerprint with NO salt (or a deterministic salt
 * like the empty string), and use `StateStorageIdentity` to pick
 * the right slot.
 *
 * Inputs are canonicalised as a SET before the fingerprint is
 * computed: two producers that declare the same inputs in
 * different orders MUST produce the same fingerprint.
 */

import type { Sha256Hex } from './hash';

/** Stable string id for an input source. */
export type ProducerInputKind =
	/** Path glob; digest = sha256 of the listed files' contents. */
	| 'path-glob'
	/** Single file; digest = sha256 of the file bytes. */
	| 'file'
	/** Pre-computed digest of a content-addressed blob. */
	| 'git-blob'
	/** Producer-declared structured input with a manual digest. */
	| 'opaque';

/** Canonical key used to look up an input's contents in an `IStateInputSnapshot`. */
/** A single input a producer depends on, with stable equality + digest. */
export interface IProducerInput {
	readonly kind: ProducerInputKind;
	/** Canonical string identifying the input (glob / path / SHA / opaque id). */
	readonly locator: string;
	/** Lower-case hex sha256 of the input's content (or its listing). */
	readonly digest: Sha256Hex;
	/** Optional parser version that produced the digest. */
	readonly parserVersion?: number;
}

/** Producer declaration as it appears in the canonical fingerprint. */
export interface IProducerFingerprintEntry {
	readonly id: string;
	readonly producerVersion: number;
	readonly abiVersion: number;
	/**
	 * Canonicalised SET of inputs. The fingerprint treats
	 * `{A, B}` and `{B, A}` as the same producer; the
	 * canonical serialisation sorts them.
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
export interface CanonicalProjectFingerprint {
	readonly abiVersion: number;
	/** Sorted lex by `id`. */
	readonly producers: readonly IProducerFingerprintEntry[];
}

/**
 * Host-local storage identity. Distinct from the canonical
 * fingerprint on purpose: two machines may have different
 * `StateStorageIdentity` (different repoInstanceId, different
 * worktreeId) but the same `CanonicalProjectFingerprint`.
 */
export interface StateStorageIdentity {
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
			readonly kind: ProducerInputKind;
			readonly locator: string;
			readonly digest: Sha256Hex;
			readonly parserVersion?: number;
		}>;
	}>;
}

/**
 * Sort an inputs array canonically. Two inputs are considered
 * the same iff kind + locator + parserVersion match (regardless
 * of digest). The digest is intentionally NOT part of equality
 * — two equivalent inputs with different digests is a host
 * bug, and we want the fingerprint to highlight it.
 */
export function canonicalizeInputs(
	inputs: readonly IProducerInput[],
): readonly IProducerInput[] {
	const sorted = [...inputs].sort((a, b) => compareInputKey(a, b));
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
		inputs: canonicalizeInputs(p.inputs),
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
	fp: CanonicalProjectFingerprint,
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
	a: CanonicalProjectFingerprint,
	b: CanonicalProjectFingerprint,
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
		const ka = canonicalizeInputs(pa.inputs);
		const kb = canonicalizeInputs(pb.inputs);
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
