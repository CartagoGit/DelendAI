/**
 * How long `work publish` waits for a cadence push of the same work ref
 * to finish before it gives up. One push runs the pre-push hook once,
 * which is well under this; a holder past it is stuck, not busy.
 */
export const WORK_PUBLISH_HOLD_WAIT_MS = 180_000;

/** How often a waiting publication asks for the work ref again. */
export const WORK_PUBLISH_HOLD_POLL_MS = 1_000;
