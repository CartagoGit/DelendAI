/**
 * Cross-process critical section over a shared state file.
 *
 * `writeFileAtomic` makes a single write crash-safe (a reader never sees
 * a torn file), but it does NOT prevent *lost updates*: when two agents
 * run read → mutate → write concurrently, the second `rename` silently
 * overwrites the first agent's change. The fix is a mutex around the
 * whole read-modify-write, not just the write.
 *
 * This is a portable advisory lock built on `open(path, 'wx')` — an
 * atomic `O_CREAT | O_EXCL` create that fails with `EEXIST` when the
 * sidecar `<target>.mutex` already exists.
 *
 * Two properties make it correct under contention and crashes:
 *
 * - **Ownership token.** The holder writes `pid\nts\nUUID` into the
 *   sidecar and, on exit, removes it *only if the token still matches*.
 *   If the lock was stolen (the holder overran `staleMs` and was declared
 *   abandoned), the original holder will NOT delete the new holder's
 *   lock — the race that would otherwise leave the new holder unprotected
 *   and let a third agent enter.
 * - **Heartbeat.** While `fn()` runs, the holder refreshes the sidecar's
 *   mtime every `heartbeatMs`, so a live-but-slow holder is never mistaken
 *   for a crashed one. A waiter steals only when the lock is older than
 *   `staleMs` (the holder's process died and stopped refreshing) or, as a
 *   last-resort anti-deadlock net, after waiting longer than `timeoutMs`.
 *
 * In the common single-process case there is no contention: the first
 * `open` succeeds immediately, so the wrapper is transparent.
 */
export interface IFileMutexOptions {
    /** Wait at most this long before stealing the lock as a last resort (ms). Default 5000. */
    readonly timeoutMs?: number;
    /** A held lock not refreshed within this is treated as abandoned (ms). Default 30000. */
    readonly staleMs?: number;
    /** Poll interval between acquisition attempts (ms). Default 25. */
    readonly pollMs?: number;
    /** How often the holder refreshes its lock mtime while `fn()` runs (ms). Default `staleMs / 3`. */
    readonly heartbeatMs?: number;
}
export declare const withFileMutex: <T>(targetPath: string, fn: () => Promise<T>, options?: IFileMutexOptions) => Promise<T>;
