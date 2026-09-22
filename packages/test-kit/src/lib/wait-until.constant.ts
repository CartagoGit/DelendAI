/** Constants for `./wait-until.helper`. */

/**
 * How long to keep asking before calling it a hang.
 *
 * Generous on purpose: this is not a performance budget, it is the point
 * at which a hang becomes a readable failure. A condition that holds
 * returns immediately, so the ceiling costs a passing test nothing.
 */
export const WAIT_TIMEOUT_MS = 10_000;

/** How often to ask. Short enough that the fast path stays fast. */
export const WAIT_INTERVAL_MS = 10;
