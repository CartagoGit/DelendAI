/** Contracts for `check-workflow-invariants.script.ts`. */

/**
 * Where an invariant can be judged.
 *
 * `checkout` invariants are about THIS working copy and are meaningless
 * on a CI runner, whose checkout is always clean and always detached —
 * reporting them there would be a gate that is permanently and falsely
 * red. `forge` invariants are about the refs everyone shares, and are
 * the same answer from anywhere.
 */
export type IInvariantScope = 'checkout' | 'forge';

/** What one invariant answered, and the evidence for the answer. */
export interface IInvariantResult {
	readonly scope: IInvariantScope;
	/** Short stable id, so a failure can be grepped and fixed. */
	readonly id: string;
	/** The promise, stated as the thing that must be true. */
	readonly claim: string;
	readonly holds: boolean;
	/**
	 * What was actually observed. Present whether the invariant held or
	 * not: a check that only speaks when it fails cannot be trusted to
	 * have looked.
	 */
	readonly observed: string;
	/** What to run, when it does not hold. */
	readonly remedy?: string;
}

/** The whole report, in declaration order. */
export interface IInvariantReport {
	readonly results: readonly IInvariantResult[];
	readonly broken: number;
}
