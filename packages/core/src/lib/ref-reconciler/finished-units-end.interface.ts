/** Contract shapes for `./finished-units-end.service`. */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

export interface IEndFinishedUnitsInput {
	/** Any checkout of the clone; the pass runs from its main worktree. */
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	/** Reports only, without it. */
	readonly apply: boolean;
	/** Seconds since the epoch; the clock the standings are judged at. */
	readonly now?: number | undefined;
}

/**
 * `ended`: every copy of the unit is gone and each tip is kept at
 * `retiredRefs`. `kept`: the unit stays, for `reason`.
 */
export type IEndedUnitOutcome = 'ended' | 'would-end' | 'kept';

export type IKeptUnitReason =
	/** A copy carries a commit the integration branch does not hold. */
	| 'holds-work'
	/** Its owner is live, or the unit waits on something on purpose. */
	| 'live'
	/**
	 * It never moved off the integration branch and its owner is not yet
	 * gone: an agent who entered may still start.
	 */
	| 'unstarted'
	/** Its worktree holds an edit nobody committed. */
	| 'edited'
	/** It is checked out in the shared checkout itself. */
	| 'shared-checkout'
	/** Git refused a step; what was not removed stays. */
	| 'refused';

export interface IEndedUnit {
	/** The unit, as its refs name it after the work or publication prefix. */
	readonly unit: string;
	readonly outcome: IEndedUnitOutcome;
	readonly reason?: IKeptUnitReason | undefined;
	/** Every ref of the unit the pass judged: local and remote, work and publication. */
	readonly refs: readonly string[];
	readonly worktree: string | null;
	/** The edits that kept it, when it was kept for them. */
	readonly edited: readonly string[];
	/** Where its tips are kept, when it ended. */
	readonly retiredRefs: readonly string[];
}
