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
}

/** The picture handed to an agent that is starting a unit of work. */
export interface IWorkBriefing {
	/** Live units of work belonging to somebody else. */
	readonly others: readonly IBriefedUnit[];
	/** Paths more than one unit of work is already changing. */
	readonly contested: readonly string[];
}
