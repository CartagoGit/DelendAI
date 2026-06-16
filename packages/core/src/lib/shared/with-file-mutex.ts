import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, utimes } from 'node:fs/promises';
import { dirname } from 'node:path';

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

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

export const withFileMutex = async <T>(
	targetPath: string,
	fn: () => Promise<T>,
	options: IFileMutexOptions = {}
): Promise<T> => {
	const timeoutMs = options.timeoutMs ?? 5_000;
	const staleMs = options.staleMs ?? 30_000;
	const pollMs = options.pollMs ?? 25;
	const heartbeatMs = options.heartbeatMs ?? Math.max(50, Math.floor(staleMs / 3));
	const lockPath = `${targetPath}.mutex`;
	// Unique per acquisition: identifies *this* holder so release never
	// deletes a lock that was stolen and is now owned by someone else.
	const token = `${process.pid}\n${Date.now()}\n${randomUUID()}`;

	await mkdir(dirname(targetPath), { recursive: true });

	const deadline = Date.now() + timeoutMs;
	let acquired = false;
	for (;;) {
		try {
			const handle = await open(lockPath, 'wx');
			try {
				await handle.writeFile(token);
			} finally {
				await handle.close();
			}
			acquired = true;
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			// Held by another writer. Steal it if it looks abandoned.
			try {
				const info = await stat(lockPath);
				if (Date.now() - info.mtimeMs > staleMs) {
					await rm(lockPath, { force: true });
					continue;
				}
			} catch {
				// The sidecar vanished between open and stat: retry now.
				continue;
			}
			if (Date.now() >= deadline) {
				// Contention outlived the timeout: steal to avoid deadlock.
				// Safe even if the holder is still alive — the ownership
				// token guarantees it won't delete the lock we create next.
				await rm(lockPath, { force: true }).catch(() => undefined);
				continue;
			}
			await sleep(pollMs);
		}
	}

	// Keep the lock fresh so a slow-but-alive holder is not declared stale.
	const heartbeat = setInterval(() => {
		const now = new Date();
		void utimes(lockPath, now, now).catch(() => undefined);
	}, heartbeatMs);
	heartbeat.unref?.();

	try {
		return await fn();
	} finally {
		clearInterval(heartbeat);
		if (acquired) {
			// Remove the lock only if it is still ours. If a stealer replaced
			// it, deleting it would unprotect the new holder.
			try {
				const current = await readFile(lockPath, 'utf8');
				if (current === token) await rm(lockPath, { force: true });
			} catch {
				// Already gone (stolen and released): nothing to do.
			}
		}
	}
};
