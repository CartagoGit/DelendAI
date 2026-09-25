/**
 * Constants for `./work-ref-lock`.
 *
 * Split out of the implementation module so the repo's "constants live
 * in contracts" convention holds. Re-exported from `work-ref-lock.ts`, so
 * no import site changes.
 */

/**
 * How long a work-ref lock is honoured before it is taken as abandoned.
 * A publication pushes through the pre-push hook, which runs the gates:
 * minutes, not seconds. Shorter than that and a slow publication would
 * lose its lock to the very push it is excluding.
 */
export const WORK_REF_LOCK_TTL_MS = 600_000;

/** Where, under the git common directory, the lock files live. */
export const WORK_REF_LOCK_DIRECTORY = 'delendai/work-ref-locks';
