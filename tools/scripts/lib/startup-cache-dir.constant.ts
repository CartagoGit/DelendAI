/**
 * startup-cache-dir.constant.ts — the directory under the cache where the
 * host server keeps its startup reconciliation lock.
 *
 * The host writes it and the stray-cache lint must know it: named twice,
 * the lint called the host's own lock a stray file after every restart,
 * and `bun run validate` could not be green in the checkout agents use.
 */
export const STARTUP_CACHE_DIR = 'startup';
