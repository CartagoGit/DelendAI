/**
 * Constants for `./startup-mutex`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `startup-mutex.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `startup-mutex.ts`, so no import site changes.
 */

/** How long a lock file is honoured before it is considered abandoned. */
export const STARTUP_LOCK_TTL_MS = 120_000;
