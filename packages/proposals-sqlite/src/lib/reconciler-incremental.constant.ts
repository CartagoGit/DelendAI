/**
 * Constants for `./reconciler-incremental.service`.
 */

/**
 * Written into every `runs` row this pass records, so a run can be
 * traced back to the code that produced it. Bump it when the shape of
 * what an incremental pass writes changes — a reader comparing rows
 * across versions needs to know which of them it can trust.
 */
export const RECONCILER_INCREMENTAL_VERSION = 'r00055-s1';
