/** Contract shapes for `./local-merge-gate`. */

/** What certified this candidate, and against which integration head. */
export interface ILocalCertification {
	/** True when the certifying run passed. */
	readonly passed: boolean;
	/** The integration head the certification was produced against. */
	readonly againstIntegrationSha: string;
}

/** Everything the decision needs, and nothing it does not. */
export interface ILocalMergeInput {
	/** The work ref asking to land. */
	readonly workRef: string;
	/** Its tip. */
	readonly workSha: string;
	/** The integration branch's tip, re-read inside the critical section. */
	readonly integrationSha: string;
	/** True when `workSha` has `integrationSha` in its ancestry. */
	readonly builtOnIntegrationHead: boolean;
	/** Absent when nothing certified this candidate at all. */
	readonly certification?: ILocalCertification | undefined;
}

/**
 * What may happen next.
 *
 * `revalidate` is deliberately not `refuse`: a candidate whose base
 * moved is not wrong, it is unanswered, and the two need different
 * words because only one of them is somebody's mistake.
 */
export type ILocalMergeDecision = 'merge' | 'revalidate' | 'refuse';

export interface ILocalMergeVerdict {
	readonly decision: ILocalMergeDecision;
	/** A sentence naming the evidence that decided it. */
	readonly reason: string;
	/** Present only on `merge`: the method the policy chose. */
	readonly mergeMethod?: string | undefined;
}
