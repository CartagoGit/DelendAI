/**
 * proposals-watch.constant.ts — how the slice listener waits for a change
 * to the proposal documents.
 */

/** Quiet time after the last change before the listener checks once. */
export const PROPOSALS_WATCH_DEBOUNCE_MS = 300;

/** How often the safety poll still runs while a watcher is live. */
export const PROPOSALS_SAFETY_POLL_MS = 300_000;

/** How often a watching server asks whether it holds the lease now. */
export const PROPOSALS_TAKEOVER_POLL_MS = 30_000;
