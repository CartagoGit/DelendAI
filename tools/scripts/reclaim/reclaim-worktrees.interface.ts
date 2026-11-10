/** Types for `./reclaim-worktrees.script`. */

/** A worktree, with everything needed to judge it. */
export interface IWorktree {
	/** Absolute path of the working directory. */
	readonly path: string;
	/** The commit it has checked out. */
	readonly head: string;
	/** True for the checkout that owns `.git`; never a candidate. */
	readonly isMain: boolean;
	/** True when this is the worktree the reaper is running from. */
	readonly isCurrent: boolean;
	/**
	 * Changed paths that are somebody's WORK — generated artifacts
	 * excluded, because a file this repository regenerates can be
	 * rewritten by any command that happens to run and is nobody's.
	 */
	readonly dirtyPaths: number | null;
	/**
	 * `dirtyPaths` is `null` when git could not say (the status failed or
	 * timed out). Unknown is not clean: such a desk is kept.
	 */
	/** True when the integration branch contains its head. */
	readonly delivered: boolean;
	/** True when git has marked it locked. */
	readonly locked: boolean;
	/** True when HEAD is detached (no branch carries its commits). */
	readonly detached: boolean;
	/**
	 * True when a remote-tracking ref contains its head: the work is on the
	 * forge, whatever the integration branch has done with it.
	 */
	readonly headOnRemote: boolean;
	/**
	 * Its `MERGE_HEAD` when a merge is in progress, else `undefined`; and
	 * whether a remote ref contains that commit too.
	 */
	readonly mergeHead?: { readonly onRemote: boolean };
	/**
	 * True for the `--branch` / `--version` runtime trees other projects'
	 * servers run from (`.cache/delendai/branch-runtime/*`).
	 */
	readonly runtime: boolean;
	/**
	 * For `.git/delendai-prove/*`: whether the process that made it is
	 * still alive. `null` for every other worktree.
	 */
	readonly proofHolder: 'live' | 'dead' | null;
	/**
	 * When git last did anything in this worktree (epoch ms), or 0 when
	 * that cannot be told.
	 *
	 * The swarm's missing signal. Every refusal above is about the
	 * CONTENT of a desk, and a desk can be perfectly clean and fully
	 * delivered while an agent is still sitting at it — between a push
	 * and its next edit, say. Removing it then pulls the directory out
	 * from under a running process. Git touches this worktree's index on
	 * every checkout, add, status and commit, so recent activity is the
	 * cheapest honest answer to "is somebody here".
	 */
	readonly lastActivityMs: number;
}

/**
 * What a worktree is, and therefore what may be done to it.
 *
 * Every value except `spent` means "leave it alone", which is the same
 * ratio `reclaim-local` is built on and for the same reason: a worktree
 * is somebody's desk. The reaper has exactly one reason to clear one,
 * and every situation it does not recognise resolves to keeping it.
 */
export const WORKTREE_ROLES = [
	/** The checkout that owns the repository. Never a candidate. */
	'main',
	/** The worktree this very process is running from. */
	'current',
	/** Git has it locked: somebody said explicitly not to touch it. */
	'locked',
	/** It has uncommitted changes. They may exist nowhere else. */
	'dirty',
	/** Git could not say whether it holds uncommitted work: unproven, so kept. */
	'unknown',
	/** Its head is not in the integration branch: unpublished work. */
	'undelivered',
	/** A runtime tree other projects' servers run from: never reclaimed. */
	'runtime',
	/** A proof worktree whose process is still alive. */
	'proving',
	/** Git did something here recently: somebody is probably sitting at it. */
	'active',
	/** Clean, and everything it holds is already in the integration branch. */
	'spent',
] as const;

export type IWorktreeRole = (typeof WORKTREE_ROLES)[number];

export interface IWorktreeVerdict {
	readonly path: string;
	readonly role: IWorktreeRole;
	readonly reason: string;
}

/** How the judgement is calibrated, so a spec need not wait out a clock. */
export interface IWorktreeJudgement {
	/** Now, in epoch ms. */
	readonly now: number;
	/**
	 * How long git silence must last before a desk counts as empty.
	 *
	 * Two hours by default: long enough that an agent mid-slice is never
	 * swept, short enough that the desks measured here — idle for weeks —
	 * are still cleared the first time this runs.
	 */
	readonly activeWindowMs: number;
}

export interface IWorktreeReclamation {
	readonly verdicts: readonly IWorktreeVerdict[];
	/** The ones a `--apply` run would remove. */
	readonly spent: readonly IWorktreeVerdict[];
}
