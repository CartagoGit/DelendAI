/**
 * Shapes for `./publication-proof-gate.script`.
 *
 * Split out so the repo's "types live beside the behaviour, not inside
 * it" convention holds, and so a spec can name a step without importing
 * the script that spawns processes.
 */

/** One command in the pre-flight, with the reason it earned its place. */
export interface IProofStep {
	/** The `package.json` script to run. */
	readonly script: string;
	/** Why this check is worth the seconds — an observed failure, not a hunch. */
	readonly because: string;
}

/** What the gate concluded about a push. */
export interface IProofGateDecision {
	readonly ok: boolean;
	/** The publication refs this push would create or move. */
	readonly publications: readonly string[];
	/** Scripts that failed, in the order they ran. */
	readonly failed: readonly string[];
}
