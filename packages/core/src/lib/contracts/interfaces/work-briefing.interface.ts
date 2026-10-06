/** What an agent is told about the rest of the swarm as it sits down. */

/** One other agent's live unit of work, as the briefing states it. */
export interface IBriefedUnit {
	/** The identity that owns it, from its ref's own name. */
	readonly agent: string;
	/** Its logical ref, without `refs/heads/` or a remote prefix. */
	readonly ref: string;
	/** What the rest of that ref's name says it is about. */
	readonly subject: string;
	/** The paths it has changed since it branched. */
	readonly paths: readonly string[];
	/**
	 * Whether it is a publication waiting to land rather than a unit still
	 * being worked on. Its files change in the integration branch when it
	 * merges, so starting on them now buys a conflict.
	 */
	readonly published: boolean;
}

/** The picture handed to an agent that is starting a unit of work. */
export interface IWorkBriefing {
	/** Live units and unlanded publications belonging to somebody else. */
	readonly others: readonly IBriefedUnit[];
	/** Paths more than one unit of work is already changing. */
	readonly contested: readonly string[];
}

/** The worktree `work enter` hands back, before the briefing is added. */
export interface IEnteredWorktree {
	/** The logical ref this identity works in. */
	readonly ref: string;
	/** The same ref as a branch name. */
	readonly branch: string;
	/** Where the working tree is, or null if git did not report one. */
	readonly path: string | null;
	/** Whether this call created it, rather than finding it. */
	readonly created: boolean;
	/**
	 * The session that holds the unit (x00699). Pass it back
	 * (`--session`, or `DELENDAI_SESSION_ID`) to enter the unit again.
	 */
	readonly session?: string | undefined;
	/**
	 * Set when the unit held nothing of its own and was fast-forwarded to
	 * the integration branch on the way in.
	 */
	readonly hydrated?: true;
}
