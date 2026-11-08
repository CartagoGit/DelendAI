/** Constants for `./hydration-watch`. */

/**
 * How often a running server re-checks whether the forge moved past it.
 *
 * A minute is chosen from what the pass costs and what being wrong
 * costs: a fetch of two namespaces against a warm remote is a few
 * hundred milliseconds, while a checkout that is one merge behind
 * publishes work built on a tree that no longer exists. Anything much
 * longer and an agent starting a slice is already reading stale files;
 * anything much shorter buys nothing, because pull requests do not land
 * that fast.
 */
export const DEFAULT_HYDRATION_INTERVAL_MS = 60_000;
