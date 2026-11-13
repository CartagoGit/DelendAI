/**
 * swarm-hygiene-limits.constant.ts — f00075 + f00091.
 *
 * Truncation caps and thresholds for the read-only `swarm_hygiene`
 * snapshot. Caps keep the tool payload cheap; the stale-behind
 * threshold decides when an unmerged worktree has fallen far enough
 * behind base to be a rescue signal (f00091 S4b).
 */

export const DEFAULT_MAX_RESCUE = 20;
export const DEFAULT_MAX_GC = 20;
export const DEFAULT_MAX_OUT = 20;
export const DEFAULT_MAX_PENDING = 50;
export const DEFAULT_MAX_NON_CONFORMING = 50;
export const DEFAULT_MAX_STALE_UNMERGED = 50;

/**
 * f00091 S4b: an unmerged worktree branch `behind` base by more than
 * this many commits is flagged `staleUnmerged`. Zero disables the check.
 */
export const DEFAULT_STALE_BEHIND_THRESHOLD = 50;
