/**
 * recent-edit-filter.constant.ts
 */

/**
 * Default quiet period.
 *
 * Shorter than the smallest sensible sweep interval, so a file left alone
 * is picked up by the very next sweep rather than lingering: the point is
 * to miss the edit in progress, not to postpone the commit.
 */
export const DEFAULT_QUIET_PERIOD_MS = 90_000;
