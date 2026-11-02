/** What an agent is told about the rest of the swarm as it sits down. */
import type { IUnitDependencies } from './unit-dependencies.interface';

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

/** One file a task names, by reference: its size says what reading it costs. */
export interface ITaskFile {
	readonly path: string;
	/** Absent when the task will create it. */
	readonly bytes?: number;
}

/**
 * What a unit is for, so an agent starts on its task instead of searching for
 * it. By reference, never by body: the reach follows the slice, from one file
 * to hundreds, and the agent reads what the work needs.
 */
export interface ITaskBriefing {
	readonly goal: string;
	readonly slices: readonly {
		readonly id: string;
		readonly title: string;
		readonly acceptance: readonly string[];
	}[];
	readonly files: readonly ITaskFile[];
	readonly specs: readonly string[];
}

/** A unit a task briefing is asked for. */
export interface ITaskBriefingRequest {
	readonly worktree: string;
	readonly proposal: string;
	readonly slice: string;
}

/** Where tasks live is the planning plugin's; core only asks. */
export type TTaskBriefingProvider = (
	request: ITaskBriefingRequest,
) => Promise<ITaskBriefing | undefined>;

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
	/** What entering did about the project's dependencies in the new worktree. */
	readonly dependencies?: IUnitDependencies | undefined;
	/**
	 * Set when the unit held nothing of its own and was fast-forwarded to
	 * the integration branch on the way in.
	 */
	readonly hydrated?: true;
}
