/**
 * slice-listener.constant.ts — tuning constants for the slice listener.
 */

/**
 * How many un-persisted slices the listener's FIRST poll may emit.
 *
 * The bound exists for the cold-start case: a fresh clone, or a repo
 * whose `.commit-policy/` was deleted, has an empty processed-events
 * store, so every historical `done` slice looks un-persisted. Without a
 * cap that is the 83-event startup storm again. With it, the listener
 * does the most recent handful and says out loud how many it skipped —
 * bounded work and an honest report, instead of either a flood or a
 * silent drop.
 */
export const BASELINE_EMIT_LIMIT = 10;
