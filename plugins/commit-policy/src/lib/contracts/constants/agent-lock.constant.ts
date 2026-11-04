/**
 * Default heartbeat window for reading someone else's claim.
 *
 * Mirrors the lock engine's own default. The lock file's own
 * `stale_after_minutes` is authoritative when present, so the two cannot
 * drift apart in practice; this only covers a file that omits it.
 */
export const DEFAULT_AGENT_LOCK_STALE_MINUTES = 10;
