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

/**
 * Trailer naming the work ref a checkpoint was written for. The ref is
 * the unit's identity — its template says who owns it and what it is —
 * so a commit that carries it stays attributable after a squash or a
 * rebase has dropped the ref and the merge that would have named it.
 */
export const REF_TRAILER = 'Delendai-Wip-Ref';
