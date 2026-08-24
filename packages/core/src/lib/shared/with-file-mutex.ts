import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import {
	mkdir,
	open,
	readFile,
	rename,
	rm,
	stat,
	utimes,
} from 'node:fs/promises';
import { dirname } from 'node:path';

import type { IMutexMetricsCollector } from '../contracts/interfaces/mutex-metrics.interface';
import { getNoopMutexMetricsCollector } from './mutex-metrics.helper';

/**
 * Reentrance tracker: tracks the set of lock paths currently held by this
 * async call stack. Nested calls for an already-held path skip the mutex
 * acquisition entirely (the outer call still holds it). This prevents the
 * agent_lock engine from deadlocking on `tryAcquireFileLocks` which would
 * otherwise re-acquire the same mutex the outer `executeLockAction`
 * wrapper already holds.
 */
const lockStack = new AsyncLocalStorage<Set<string>>();

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
	/**
	 * What to do when a **live** holder keeps the lock past `timeoutMs`:
	 * - `'fail'` (default, a00065 S2): throw `LockContentionError` so the caller
	 *   backs off (e.g. waits for a `lock-released` notification) rather than
	 *   preempting a peer mid-write. This is the safe default — stealing a
	 *   live holder lets both critical sections run at once, which is a
	 *   lost-update / corruption hazard ("a mutex that stops being a mutex").
	 * - `'wait'` (a00085 #6): same as `'fail'` at the deadline (never steal a
	 *   live holder) but documents a reader that is *trying* to wait out the
	 *   writer. Call sites that previously passed `'fail'` on a read path
	 *   should switch to `'wait'` so the intent is grep-able.
	 * - `'steal'`: reclaim the lock anyway — the historical last-resort
	 *   anti-deadlock behaviour. The ownership token stops the old holder from
	 *   deleting ours, but it CAN clobber a slow-but-alive holder under load, so
	 *   it must now be opted into EXPLICITLY, with an operational reason, per
	 *   call site.
	 * An **abandoned** (stale) lock — one whose holder crashed and stopped
	 * refreshing the heartbeat past `staleMs` — is ALWAYS reclaimed regardless
	 * of this option, so the deadlock-avoidance property is preserved either way.
	 */
	readonly onContention?: 'steal' | 'fail' | 'wait';
	/** Optional aggregate-only collector for contention metrics. */
	readonly metrics?: IMutexMetricsCollector;
}

interface IObservedLockLease {
	readonly mtimeMs: number;
	readonly token: string;
}

interface IWithFileMutexTestHooks {
	afterObserveStale?(lease: IObservedLockLease): Promise<void> | void;
}

let withFileMutexTestHooks: IWithFileMutexTestHooks | undefined;

export const __setWithFileMutexTestHooks = (
	hooks: IWithFileMutexTestHooks | undefined,
): void => {
	withFileMutexTestHooks = hooks;
};

export const __resetWithFileMutexTestHooks = (): void => {
	withFileMutexTestHooks = undefined;
};

/** Thrown by `withFileMutex` under `onContention: 'fail'` when a live holder
 * keeps the lock past `timeoutMs`. Lets a caller back off instead of stealing. */
export class LockContentionError extends Error {
	readonly code = 'lock-contention-budget-exceeded';
	constructor(lockPath: string, timeoutMs: number) {
		super(
			`lock contention: "${lockPath}" held past ${timeoutMs}ms by a live holder`,
		);
		this.name = 'LockContentionError';
	}
}

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const observeLockLease = async (
	path: string,
): Promise<IObservedLockLease | undefined> => {
	try {
		const [token, info] = await Promise.all([
			readFile(path, 'utf8'),
			stat(path),
		]);
		return { token, mtimeMs: info.mtimeMs };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return undefined;
		}
		throw error;
	}
};

const removeIfOwned = async (
	path: string,
	expectedToken: string,
): Promise<void> => {
	try {
		const current = await readFile(path, 'utf8');
		if (current === expectedToken) {
			await rm(path, { force: true });
		}
	} catch {
		return;
	}
};

const restoreReclaimPath = async (
	reclaimPath: string,
	lockPath: string,
): Promise<void> => {
	try {
		await rename(reclaimPath, lockPath);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ENOENT') {
			return;
		}
		if (code === 'EEXIST') {
			await rm(reclaimPath, { force: true }).catch(() => undefined);
			return;
		}
		throw error;
	}
};

export const withFileMutex = async <T>(
	targetPath: string,
	fn: () => Promise<T>,
	options: IFileMutexOptions = {},
): Promise<T> => {
	const timeoutMs = options.timeoutMs ?? 5_000;
	const staleMs = options.staleMs ?? 30_000;
	const onContention = options.onContention ?? 'fail';
	const pollMs = options.pollMs ?? 25;
	const heartbeatMs =
		options.heartbeatMs ?? Math.max(50, Math.floor(staleMs / 3));
	const metrics = options.metrics ?? getNoopMutexMetricsCollector();
	const lockPath = `${targetPath}.mutex`;
	// Unique per acquisition: identifies *this* holder so release never
	// deletes a lock that was stolen and is now owned by someone else.
	const token = `${process.pid}\n${Date.now()}\n${randomUUID()}`;

	// Reentrance: if this async stack already holds this lock, skip the
	// filesystem mutex entirely. The outer holder still owns the critical
	// section, so nested calls are safe.
	const held = lockStack.getStore();
	if (held?.has(lockPath) === true) {
		return await fn();
	}

	// Ensure the parent directory exists. `open(..., 'wx')` raises ENOENT
	// when the dir is missing — without this guard, a fresh tmpdir would
	// never get past the first acquire.
	await mkdir(dirname(lockPath), { recursive: true });

	const deadline = Date.now() + timeoutMs;
	let acquired = false;
	let contentionObserved = false;
	let waitStartedAt: number | undefined;
	for (;;) {
		try {
			const handle = await open(lockPath, 'wx');
			try {
				await handle.writeFile(token);
			} finally {
				await handle.close();
			}
			acquired = true;
			if (waitStartedAt !== undefined) {
				metrics.recordWaitMs(Date.now() - waitStartedAt);
			}
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			if (!contentionObserved) {
				contentionObserved = true;
				waitStartedAt = Date.now();
				metrics.recordContention();
			}
			// Held by another writer. Steal it if it looks abandoned.
			try {
				const observedLease = await observeLockLease(lockPath);
				if (observedLease === undefined) {
					continue;
				}
				if (Date.now() - observedLease.mtimeMs > staleMs) {
					await withFileMutexTestHooks?.afterObserveStale?.(
						observedLease,
					);
					const reclaimPath = `${lockPath}.reclaim.${process.pid}.${randomUUID()}`;
					try {
						await rename(lockPath, reclaimPath);
						const revalidatedLease =
							await observeLockLease(reclaimPath);
						if (
							revalidatedLease !== undefined &&
							revalidatedLease.token === observedLease.token &&
							revalidatedLease.mtimeMs === observedLease.mtimeMs
						) {
							const guardToken = `${token}\nreclaim-guard`;
							try {
								const handle = await open(lockPath, 'wx');
								try {
									await handle.writeFile(guardToken);
								} finally {
									await handle.close();
								}
							} catch (guardError) {
								if (
									(guardError as NodeJS.ErrnoException)
										.code !== 'EEXIST'
								) {
									throw guardError;
								}
								await rm(reclaimPath, { force: true }).catch(
									() => undefined,
								);
								continue;
							}

							try {
								const lockHandle = await open(lockPath, 'r+');
								try {
									await lockHandle.truncate(0);
									await lockHandle.writeFile(token);
								} finally {
									await lockHandle.close();
								}
								await rm(reclaimPath, { force: true }).catch(
									() => undefined,
								);
								metrics.recordStaleReclaim();
								acquired = true;
								if (waitStartedAt !== undefined) {
									metrics.recordWaitMs(
										Date.now() - waitStartedAt,
									);
								}
								break;
							} catch (commitError) {
								await removeIfOwned(lockPath, guardToken);
								await restoreReclaimPath(reclaimPath, lockPath);
								throw commitError;
							}
						}

						await restoreReclaimPath(reclaimPath, lockPath);
						continue;
					} catch (reclaimError) {
						if (
							(reclaimError as NodeJS.ErrnoException).code ===
							'ENOENT'
						) {
							continue;
						}
						throw reclaimError;
					}
				}
			} catch {
				// The sidecar vanished between open and stat: retry now.
				continue;
			}
			if (Date.now() >= deadline) {
				// A live holder outlived the timeout (a stale one was already
				// reclaimed above). Default 'fail' (a00065 S2) lets the caller
				// back off rather than preempt a peer mid-write; explicit
				// 'steal' reclaims to avoid deadlock — safe from self-deletion
				// because the ownership token stops the old holder deleting the
				// lock we create next, but able to clobber the peer's work.
				if (onContention === 'fail' || onContention === 'wait') {
					if (waitStartedAt !== undefined) {
						metrics.recordWaitMs(Date.now() - waitStartedAt);
					}
					metrics.recordFailedAcquisition();
					throw new LockContentionError(lockPath, timeoutMs);
				}
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

	// Track this lock in the reentrance set so nested calls detect it.
	const enterStack = (parent: Set<string> | undefined): Set<string> => {
		const next = new Set<string>(parent);
		next.add(lockPath);
		return next;
	};

	return await lockStack.run(enterStack(held), async () => {
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
				} catch (releaseError) {
					// f00154 S2 audit: only ENOENT (file gone — stolen and
					// released by another holder) is benign. Other errors
					// (EACCES, EIO, EISDIR …) mean the cache dir was
					// tampered with while we held the lock — surface them
					// on stderr so an operator can investigate, but
					// otherwise leave the in-process cleanup alone.
					const code = (releaseError as NodeJS.ErrnoException).code;
					if (code !== 'ENOENT') {
						process.stderr.write(
							`withFileMutex: release failed for ${lockPath}: ${(releaseError as Error).message}\n`,
						);
					}
				}
			}
		}
	});
};
