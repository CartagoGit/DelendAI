/**
 * orphaned-work.constant.ts — the bounds of keeping an orphan moving.
 */

/**
 * How many times the hydrator brings an orphaned red candidate forward
 * before it tells the owner and stops. Each attempt is one merge of the
 * integration branch and one CI run, so the bound is what an orphan may
 * cost when nobody comes back for it.
 */
export const ORPHAN_RESCUE_ATTEMPTS = 3;

/** Where the hydrator counts its attempts, relative to the cache directory. */
export const ORPHAN_RESCUES_FILE = 'forge/orphan-rescues.json';

/** The disposition of a candidate whose author is gone. */
export const ORPHANED_DISPOSITION = 'orphaned';
