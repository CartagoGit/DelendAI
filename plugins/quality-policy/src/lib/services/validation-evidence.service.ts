/**
 * validation-evidence.service.ts — f00506 S1.
 *
 * Remembers what a validator already proved, so the same proof is not
 * bought twice.
 *
 * The goal is not to validate less. It is to stop re-running a check
 * over a state it has already passed. On a shared checkout that is
 * expensive in a way that compounds: `bun run test` takes the compute
 * lock and runs for minutes, so while one agent re-proves what is
 * already known, every other agent waits.
 *
 * What makes reuse safe is the key. Evidence is filed under everything
 * that could change the answer — the validator, what it covered, the
 * digest of the inputs it read, the digest of its configuration, and
 * the digest of the dependencies it resolved. Change any of those and
 * the evidence simply does not match, so there is nothing to decide at
 * lookup time and no way to reuse a stale pass.
 *
 * The key derivation is pure. Persistence is injected, so the decision
 * is testable without touching a disk.
 */
import { createHash } from 'node:crypto';

export type TValidationResult = 'pass' | 'fail';

/** Everything that could change a validator's answer. */
export interface IValidationEvidenceKey {
	/** `typecheck`, `lint`, `test`, … */
	readonly validator: string;
	/** What the run covered — a package, a path set, `repo`. */
	readonly scope: string;
	/** Digest of the source the validator actually read. */
	readonly inputDigest: string;
	/** Digest of the validator's own configuration. */
	readonly configDigest: string;
	/** Digest of the resolved dependencies it ran against. */
	readonly dependencyDigest: string;
}

export interface IValidationEvidence {
	readonly key: IValidationEvidenceKey;
	readonly result: TValidationResult;
	/** Epoch millis. Diagnostic only — freshness never licenses reuse. */
	readonly recordedAt: number;
	readonly durationMs: number;
	/** The inputs the run considered, for auditing a reuse after the fact. */
	readonly relevantInputs: readonly string[];
}

/**
 * A stable string for one key.
 *
 * Every field is length-prefixed before hashing so no two different
 * keys can collide by shifting a delimiter across a boundary — a
 * validator named `a:b` with scope `c` must not hash like validator `a`
 * with scope `b:c`.
 */
export const deriveEvidenceKey = (key: IValidationEvidenceKey): string => {
	const parts = [
		key.validator,
		key.scope,
		key.inputDigest,
		key.configDigest,
		key.dependencyDigest,
	];
	const canonical = parts
		.map((part) => `${part.length.toString()}:${part}`)
		.join('');
	return createHash('sha256').update(canonical).digest('hex');
};

export interface IEvidenceStore {
	read(hash: string): Promise<IValidationEvidence | undefined>;
	write(hash: string, evidence: IValidationEvidence): Promise<void>;
}

export interface IReusableVerdict {
	readonly reusable: boolean;
	/** Present when reusable. */
	readonly evidence?: IValidationEvidence | undefined;
	/** Why, in a form a human or an agent can act on. */
	readonly reason: string;
}

/**
 * Whether a recorded pass can stand in for running the validator again.
 *
 * Only a `pass` is ever reusable. A recorded failure is deliberately
 * NOT cached as an answer: a failing run is what an agent is trying to
 * fix, and handing back the old failure would make the fix invisible.
 */
export const findReusableEvidence = async (
	key: IValidationEvidenceKey,
	store: IEvidenceStore,
): Promise<IReusableVerdict> => {
	const evidence = await store.read(deriveEvidenceKey(key));
	if (evidence === undefined) {
		return {
			reusable: false,
			reason: 'no evidence recorded for this exact validator, scope, input, config and dependency state',
		};
	}
	if (evidence.result !== 'pass') {
		return {
			reusable: false,
			reason: 'the recorded run failed, and a failure is never reused — it is the thing being fixed',
		};
	}
	return {
		reusable: true,
		evidence,
		reason: `reusing the pass recorded at ${new Date(evidence.recordedAt).toISOString()} over an identical input, config and dependency state`,
	};
};

export const recordEvidence = async (
	evidence: IValidationEvidence,
	store: IEvidenceStore,
): Promise<void> => {
	await store.write(deriveEvidenceKey(evidence.key), evidence);
};
