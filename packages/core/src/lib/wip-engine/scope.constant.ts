/**
 * Constants for `./scope`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `scope.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `scope.ts`, so no import site changes.
 */

/** Trailer carrying one claimed path. Repeated once per path. */
export const SCOPE_TRAILER = 'Delendai-Wip-Scope';

/** Trailer carrying the checkpoint's patch digest. */
export const DIGEST_TRAILER = 'Delendai-Wip-Digest';
