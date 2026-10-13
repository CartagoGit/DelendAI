/**
 * unit-forge-sync.interface.ts — what a start did to bring each unit in
 * step with the forge.
 */
import type { IResolvedDevelopmentPolicy } from './development-policy.interface';
import type { IGitRunner } from './git-runner.interface';

export type IUnitForgeSyncOutcome =
	/** This clone had commits the forge lacked; they were pushed. */
	| 'pushed'
	/** The forge had commits this clone lacked; the unit moved forward. */
	| 'fast-forwarded'
	/** A unit made on another machine; its branch now exists here too. */
	| 'fetched'
	/** Uncommitted edits of a unit nobody is working in were committed and pushed. */
	| 'kept-uncommitted'
	/** Its proposal left in-progress; its work was integrated and the branch ended. */
	| 'published'
	/** Both sides moved: nothing was overwritten; `repair` reconciles it. */
	| 'diverged'
	/** Something could not be done; `detail` says what. */
	| 'failed';

export interface IUnitForgeSync {
	readonly branch: string;
	readonly outcome: IUnitForgeSyncOutcome;
	readonly detail?: string;
	readonly repair?: string;
}

/** What one pass needs: git here and in each worktree, and who is live. */
export interface IUnitForgeSyncInput {
	readonly run: IGitRunner;
	/** A runner in another directory: a unit's worktree. */
	readonly runIn: (cwd: string) => IGitRunner;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	/** Whether somebody is working in the unit now; its edits are theirs. */
	readonly isLive: (branch: string) => boolean;
}
