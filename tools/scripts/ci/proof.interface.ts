/**
 * proof.interface.ts — a local proof's seal, and what CI concludes of it.
 */
export interface IProofStep {
	readonly name: string;
	readonly ok: boolean;
	readonly seconds: number;
}

export interface IProof {
	/** The commit proved. */
	readonly head: string;
	/** Its tree: the content proved, whatever the commit says. */
	readonly tree: string;
	/** The integration commit the plan was made against (the merge base). */
	readonly base: string;
	/** sha256 of the zone matrix the planner gave for that base. */
	readonly planDigest: string;
	readonly ok: boolean;
	readonly steps: readonly IProofStep[];
	readonly seconds: number;
	readonly agent: string;
	readonly at: string;
}

export interface IProofVerdict {
	readonly proved: boolean;
	readonly why: string;
}
