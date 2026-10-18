/**
 * work-ref-lifecycle.interface.ts — what is known about a work ref, and
 * what the one rule for its life says to do with it.
 */

/** What the rule decides for a work ref. */
export type IWorkRefFate = 'keep' | 'restore' | 'withdraw' | 'reap';

/** The facts the rule reads; every caller gathers them its own way. */
export interface IWorkRefFacts {
	/** The integration branch holds every commit the ref has. */
	readonly landed: boolean;
	/** The forge has the ref. */
	readonly onForge: boolean;
	/** Its proposal is in progress at the ref's own tip. */
	readonly openAtTip: boolean;
	/** Its proposal is in progress on the integration branch. */
	readonly openOnIntegration: boolean;
	/**
	 * Its worktree: none, a clean one nobody stands in, or one in use
	 * (somebody's checkout, or changes git would lose).
	 */
	readonly worktree: 'none' | 'clean' | 'in-use';
}

/** The rule's answer, with the reason to report. */
export interface IWorkRefVerdict {
	readonly fate: IWorkRefFate;
	readonly reason: string;
}
