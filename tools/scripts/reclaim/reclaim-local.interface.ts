/** Types for `./reclaim-local.script`. */

/** A local branch, with everything needed to judge it. */
export interface ILocalBranch {
	readonly name: string;
	/** Commits it has that no remote-tracking ref contains. */
	readonly unpublished: number;
	/** True when a remote branch of the same name still exists. */
	readonly liveOnRemote: boolean;
	/** True when a worktree currently has it checked out. */
	readonly checkedOut: boolean;
}

/**
 * What a local branch is, and therefore what may be done to it.
 *
 * Every value except `spent-mirror` means "leave it alone". That ratio
 * is the design: the reaper has exactly one reason to delete anything,
 * and every other situation — including every situation it does not
 * recognise — resolves to keeping the branch.
 */
export const LOCAL_ROLES = [
	/** The integration or release branch. Never a candidate. */
	'protected',
	/** Carries commits no remote has. Never deleted; the only copy. */
	'local-only-work',
	/** A worktree has it checked out. The worktree goes first, or nothing does. */
	'in-use',
	/** Its remote counterpart is still there: the work is still in flight. */
	'live-mirror',
	/** Fully published, and its remote counterpart is gone. Reapable. */
	'spent-mirror',
] as const;
export type ILocalRole = (typeof LOCAL_ROLES)[number];

export interface ILocalVerdict {
	readonly name: string;
	readonly role: ILocalRole;
	/** Why, in a sentence that says what evidence decided it. */
	readonly reason: string;
}

/** What one pass concluded. */
export interface ILocalReclamation {
	readonly verdicts: readonly ILocalVerdict[];
	/** The only branches the reaper may delete. */
	readonly reapable: readonly ILocalVerdict[];
	/** Branches carrying work that exists nowhere else. */
	readonly unpublished: readonly ILocalVerdict[];
}
