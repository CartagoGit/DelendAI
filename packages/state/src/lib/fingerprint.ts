/**
 * fingerprint.ts — `ProjectFingerprint` and producer inputs.
 *
 * q00018 Phase 0 S2. The canonical fingerprint that decides whether
 * two state generations are "equivalent inputs" and therefore must
 * produce the same `canonicalStateHash`.
 *
 * Rules (these are *invariants*, not suggestions):
 *
 *   - the fingerprint MUST NOT depend on branch, hostname, path
 *     absolute, mtime, `Date.now()`, PID, locale, environment
 *     variables not declared on the producer, or any cache content.
 *   - the fingerprint MUST depend on the State ABI version, every
 *     producer's declared version, and every producer's declared
 *     input digest.
 *   - if a producer declares an input that varies per worktree
 *     (e.g. a glob over dirty files), two worktrees with different
 *     dirty state MUST produce different fingerprints — otherwise
 *     their projections collide silently.
 */

import type { StateScopeKind } from './scope';

/** Stable string id for a producer input source. */
export type ProducerInputKind =
	/** Path glob resolved by the host; digest = sha256 of the listed files. */
	| 'path-glob'
	/** Single file path; digest = sha256 of the file bytes. */
	| 'file'
	/** Pre-computed digest of a content-addressed blob (Git blob SHA). */
	| 'git-blob'
	/** Producer-declared structured input with a manually computed digest. */
	| 'opaque';

/**
 * A single input a producer depends on. The locator is opaque to
 * the engine — only the kind + the host's canonical string + the
 * digest contribute to the fingerprint.
 */
export interface IProducerInput {
	readonly kind: ProducerInputKind;
	/**
	 * Canonical string identifying the input. For `path-glob` this
	 * is the glob itself; for `file` it is the relative path; for
	 * `git-blob` it is the blob SHA; for `opaque` it is whatever
	 * the producer wants (e.g. `"docs-delendai-proposals-v1"`).
	 */
	readonly locator: string;
	/**
	 * sha256 of the input content (or its listing for `path-glob`).
	 * Lower-case hex. MUST be stable for the same content under
	 * the same parser version.
	 */
	readonly digest: string;
	/** Optional parser version that produced the digest. */
	readonly parserVersion?: number;
}

/** Producer declaration as it appears in the fingerprint. */
export interface IProducerFingerprintEntry {
	readonly id: string;
	readonly producerVersion: number;
	readonly abiVersion: number;
	readonly inputs: readonly IProducerInput[];
}

/**
 * Top-level fingerprint. Two projects with the same fingerprint
 * MUST produce the same `canonicalStateHash` (convergence). The
 * converse (different fingerprints ⇒ different state) is not
 * required: a producer can be non-injective by design.
 */
export interface ProjectFingerprint {
	readonly abiVersion: number;
	readonly producers: readonly IProducerFingerprintEntry[];
	/**
	 * Salt included by the host to break ties between intentionally
	 * independent incarnations of the same set of producers. The
	 * host typically derives this from the repo-instance id so two
	 * unrelated clones do not collide. It MUST be deterministic
	 * for the same repo-instance across boots.
	 */
	readonly salt: string;
}

/** Lower-case hex sha256 with no separator between fields. */
export type Sha256Hex = string;

/** Stable JSON serialisation used as input to the fingerprint hash. */
export interface IFingerprintCanonicalShape {
	readonly abiVersion: number;
	readonly salt: string;
	readonly producers: readonly {
		readonly id: string;
		readonly producerVersion: number;
		readonly abiVersion: number;
		readonly inputs: readonly {
			readonly kind: ProducerInputKind;
			readonly locator: string;
			readonly digest: Sha256Hex;
			readonly parserVersion?: number;
		}[];
	}[];
}

/**
 * Pure helper that compares two fingerprints structurally. Both
 * producers and inputs are compared as arrays (order-sensitive)
 * because the canonical serialisation below preserves order.
 */
export function fingerprintEqual(
	a: ProjectFingerprint,
	b: ProjectFingerprint,
): boolean {
	if (a.abiVersion !== b.abiVersion) return false;
	if (a.salt !== b.salt) return false;
	if (a.producers.length !== b.producers.length) return false;
	for (let i = 0; i < a.producers.length; i += 1) {
		const pa = a.producers[i] as IProducerFingerprintEntry;
		const pb = b.producers[i] as IProducerFingerprintEntry;
		if (pa.id !== pb.id) return false;
		if (pa.producerVersion !== pb.producerVersion) return false;
		if (pa.abiVersion !== pb.abiVersion) return false;
		if (pa.inputs.length !== pb.inputs.length) return false;
		for (let j = 0; j < pa.inputs.length; j += 1) {
			const ia = pa.inputs[j] as IProducerInput;
			const ib = pb.inputs[j] as IProducerInput;
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

/**
 * Convenience: build the canonical shape used by the canonical
 * hash. Order of producers and inputs is preserved (the caller is
 * responsible for sorting when it matters; the canonical hash
 * downstream sorts the JSON keys but not the array order).
 */
export function toCanonicalFingerprintShape(
	fp: ProjectFingerprint,
): IFingerprintCanonicalShape {
	return {
		abiVersion: fp.abiVersion,
		salt: fp.salt,
		producers: fp.producers.map((p) => ({
			id: p.id,
			producerVersion: p.producerVersion,
			abiVersion: p.abiVersion,
			inputs: p.inputs.map((i) => {
				const base = {
					kind: i.kind,
					locator: i.locator,
					digest: i.digest,
				};
				return i.parserVersion === undefined
					? base
					: { ...base, parserVersion: i.parserVersion };
			}),
		})),
	};
}

/** Stable constant for the State ABI of `@delendai/state` v0.1.x. */
export const STATE_ABI_VERSION = 1 as const;

/**
 * The set of scope kinds that the State Engine understands. Kept
 * here (not in `scope.ts`) so `fingerprint.ts` does not depend on
 * the full scope types — only on a tiny string literal that
 * happens to live in `scope.ts`. The re-export preserves the
 * single-source-of-truth.
 */
export type { StateScopeKind };
