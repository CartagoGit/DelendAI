import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

/** What a unit of work is, as far as its owner is concerned. */
export const UNIT_STANDINGS = [
	/** Its owner showed life within the lease window. */
	'live',
	/** The owner is known and quiet beyond the window: listed for adoption. */
	'idle',
	/** Quiet for so long that its owner is gone. */
	'abandoned',
	/** Its work is provably in the integration branch or a publication. */
	'delivered',
] as const;
export type IUnitStanding = (typeof UNIT_STANDINGS)[number];

/** Who owns a unit: the model, and the host session that runs it. */
export interface IUnitOwner {
	readonly agent: string;
	/** The host session, never the short-lived CLI process that wrote it. */
	readonly session: string | null;
}

/** The durable record of a unit's owner and heartbeat. Times are epoch seconds. */
export interface IUnitLease {
	/** Short work-ref name, e.g. `delendai/wip/<agent>/<kind>/<unit>/<topic>`. */
	readonly ref: string;
	readonly owner: IUnitOwner;
	readonly worktree: string | null;
	/**
	 * Where the entering client was working (`ctx.cwd`), and the workspace
	 * root of the server it entered through. They differ when an agent of
	 * another project talks to this project's server.
	 */
	readonly clientCwd?: string | null | undefined;
	readonly serverRoot?: string | null | undefined;
	/** The commit the ref pointed at when the unit was entered. */
	readonly entrySha: string | null;
	readonly enteredAt: number;
	readonly heartbeatAt: number;
}

/** What the verdict is judged from. */
export interface IUnitEvidence {
	readonly lease?: IUnitLease | undefined;
	/** Commit time of the ref's tip, the heartbeat of a unit with no lease. */
	readonly tipAt?: number | undefined;
	/** The caller proved the unit's work is already delivered. */
	readonly delivered: boolean;
	readonly now: number;
	/** The lease window in seconds. */
	readonly windowSeconds: number;
	/**
	 * The unit is published and holds nothing newer, but its proposal is
	 * still in progress, so its owner may continue on it (the branch of a
	 * proposal outlives each slice's publication).
	 */
	readonly keptForContinuation?: boolean | undefined;
	/**
	 * The unit's proposal is still in progress: its work landed but the
	 * hand-off to review has not happened, so the unit is not litter yet.
	 */
	readonly proposalInProgress?: boolean | undefined;
	/** Another agent already works on the same proposal. */
	readonly claimedByOther?: boolean | undefined;
}

/** The one verdict on a unit. */
export interface IUnitVerdict {
	readonly standing: IUnitStanding;
	readonly owner: IUnitOwner | null;
	/** Seconds since the last sign of life; null when there is none. */
	readonly silentSeconds: number | null;
	readonly reason: string;
}

/** A unit's ref, its verdict and what is needed to act on it. */
export interface IUnitStandingEntry extends IUnitVerdict {
	readonly ref: string;
	readonly worktree: string | null;
	/**
	 * The unit's publication holds commits the unit lacks (the queue
	 * refreshed the pull request): the next publish is rejected until the
	 * publication is merged into the unit.
	 */
	readonly publicationAhead: boolean;
	/** The publication ref, when the unit has one. */
	readonly publicationRef: string | null;
}

export interface IRecordUnitEntry {
	readonly clientCwd?: string | undefined;
	readonly serverRoot?: string | undefined;
	readonly cwd: string;
	readonly ref: string;
	readonly owner: IUnitOwner;
	readonly worktree: string | null;
	readonly now?: number | undefined;
}

export interface ITouchUnit {
	readonly cwd: string;
	readonly ref: string;
	readonly owner: IUnitOwner;
	readonly worktree?: string | null | undefined;
	readonly now?: number | undefined;
}

export interface IReapedUnit {
	readonly ref: string;
	readonly outcome: 'removed' | 'would-remove' | 'kept';
	readonly worktree: string | null;
	/** The edits that kept it, when it was kept. */
	readonly edited: readonly string[];
	readonly regenerable: readonly string[];
}

/** A kept unit the maintenance brought forward, or would. */
export interface IHydratedUnit {
	readonly ref: string;
	/** `kept`: it holds uncommitted changes, so it is its agent's to move. */
	readonly outcome: 'advanced' | 'would-advance' | 'kept';
}

export interface IUnitRemoval {
	readonly removedWorktree: string | null;
	readonly deletedBranch: boolean;
	/** Real edits that kept the worktree and the branch in place. */
	readonly keptBecauseEdited: readonly string[];
}

export interface IReadUnitStandings {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly now?: number | undefined;
}

export interface IWorktreeState {
	/** Edits somebody made: removing the worktree would lose them. */
	readonly edited: readonly string[];
	/** Files a generator or installer rewrites. */
	readonly regenerable: readonly string[];
}
