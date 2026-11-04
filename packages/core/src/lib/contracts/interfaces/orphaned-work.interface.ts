/**
 * orphaned-work.interface.ts — work whose author is gone, and what is
 * done to keep it moving.
 */
import type { IUnitLease } from '../../work-units/unit-lease.interface';

/**
 * Why nobody is on a unit or a publication any more:
 *
 * - `finished`: its unit ended (published, retired, handed over) and no
 *   live lease names it, so nobody will push to it again;
 * - `idle-past-window`: silent past the recovery window;
 * - `out-of-quota`: its owner's session said it ran out of quota and has
 *   shown no life since.
 */
export type IOrphanReason = 'finished' | 'idle-past-window' | 'out-of-quota';

/** What the author's presence is judged from. Times are epoch seconds. */
export interface IAuthorEvidence {
	readonly lease?: IUnitLease | undefined;
	/** When the unit's own work last moved, for a unit with no lease. */
	readonly tipAt?: number | undefined;
	/** The unit's work ref is gone: only a live lease brings it back. */
	readonly unitEnded: boolean;
	readonly now: number;
	/** The lease window in seconds. */
	readonly windowSeconds: number;
}

/** Whether somebody is still on the work, and why not when not. */
export interface IAuthorPresence {
	readonly orphaned: boolean;
	readonly reason: IOrphanReason | null;
	/** Seconds since the last beat; null when there is none. */
	readonly silentSeconds: number | null;
	readonly why: string;
}

/** A unit or a publication found orphaned. */
export interface IOrphanedWork extends IAuthorPresence {
	readonly ref: string;
	readonly agent: string;
	readonly reason: IOrphanReason;
}

/** The hydrator's count of attempts on one orphaned candidate. */
export interface IOrphanRescue {
	readonly attempts: number;
	/** When the owner was told it could not be brought forward. */
	readonly reportedAt?: string | undefined;
}

/** Every rescue in progress, keyed by the candidate's head ref. */
export interface IOrphanRescues {
	readonly rescues: Readonly<Record<string, IOrphanRescue>>;
}

/** What the hydrator does to an orphaned candidate on this pass. */
export type IOrphanRescueStep =
	/** Brought forward again; the attempt is counted. */
	| 'bring-forward'
	/** Nothing moved under it: no attempt is spent. */
	| 'wait'
	/** The Nth attempt failed: the owner is told, once. */
	| 'report'
	/** Reported already: left alone, its tip kept. */
	| 'left';
