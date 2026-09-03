import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import {
	mkdir,
	open,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
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
	readonly acquiredAt: number;
	readonly generation: number;
	readonly heartbeatAt: number;
	readonly mtimeMs: number;
	readonly token: string;
}

interface IWithFileMutexTestHooks {
	afterObserveStale?(lease: IObservedLockLease): Promise<void> | void;
	afterHeartbeat?(lease: IObservedLockLease): Promise<void> | void;
	afterReclaimRename?(context: {
		readonly reclaimPath: string;
		readonly observedLease: IObservedLockLease;
	}): Promise<void> | void;
}

interface ILockLeasePayload {
	readonly acquiredAt: number;
	readonly generation: number;
	readonly heartbeatAt: number;
	readonly token: string;
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

const RECLAIM_GRACE_MS = 50;

const isLockLeasePayload = (value: unknown): value is ILockLeasePayload => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.token === 'string' &&
		typeof candidate.acquiredAt === 'number' &&
		Number.isFinite(candidate.acquiredAt) &&
		typeof candidate.heartbeatAt === 'number' &&
		Number.isFinite(candidate.heartbeatAt) &&
		typeof candidate.generation === 'number' &&
		Number.isInteger(candidate.generation) &&
		candidate.generation >= 0
	);
};

const createLeasePayload = (
	token: string,
	nowMs: number,
	previous?: IObservedLockLease,
): ILockLeasePayload => ({
	acquiredAt: previous?.acquiredAt ?? nowMs,
	generation: previous?.generation ?? 0,
	heartbeatAt: nowMs,
	token,
});

const serializeLeasePayload = (lease: ILockLeasePayload): string =>
	JSON.stringify(lease);

const parseObservedLockLease = (
	raw: string,
	mtimeMs: number,
): IObservedLockLease => {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (isLockLeasePayload(parsed)) {
			return {
				acquiredAt: parsed.acquiredAt,
				generation: parsed.generation,
				heartbeatAt: parsed.heartbeatAt,
				mtimeMs,
				token: parsed.token,
			};
		}
	} catch {
		// Legacy sidecars and transient partial writes fall back to the
		// historical token + mtime semantics.
	}

	return {
		acquiredAt: mtimeMs,
		generation: 0,
		heartbeatAt: mtimeMs,
		mtimeMs,
		token: raw,
	};
};

const isSameLeaseObservation = (
	left: IObservedLockLease,
	right: IObservedLockLease,
): boolean =>
	left.token === right.token &&
	left.generation === right.generation &&
	left.heartbeatAt === right.heartbeatAt;

const isLeaseStale = (
	lease: IObservedLockLease,
	nowMs: number,
	staleMs: number,
): boolean => nowMs - lease.heartbeatAt > staleMs;

const writeLeaseToHandle = async (
	handle: Awaited<ReturnType<typeof open>>,
	lease: ILockLeasePayload,
): Promise<void> => {
	await handle.truncate(0);
	await handle.write(serializeLeasePayload(lease), 0, 'utf8');
};

const observeLockLease = async (
	path: string,
): Promise<IObservedLockLease | undefined> => {
	try {
		const [contents, info] = await Promise.all([
			readFile(path, 'utf8'),
			stat(path),
		]);
		return parseObservedLockLease(contents, info.mtimeMs);
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
		const current = await observeLockLease(path);
		if (current?.token === expectedToken) {
			await rm(path, { force: true });
		}
	} catch {
		return;
	}
};

const refreshLeaseHeartbeat = async (
	lockPath: string,
	token: string,
): Promise<void> => {
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(lockPath, 'r+');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return;
		}
		throw error;
	}

	try {
		const [contents, info] = await Promise.all([
			handle.readFile({ encoding: 'utf8' }),
			handle.stat(),
		]);
		const current = parseObservedLockLease(contents, info.mtimeMs);
		if (current.token !== token) {
			return;
		}
		const nextLease: ILockLeasePayload = {
			acquiredAt: current.acquiredAt,
			generation: current.generation + 1,
			heartbeatAt: Date.now(),
			token,
		};
		await writeLeaseToHandle(handle, nextLease);
		await withFileMutexTestHooks?.afterHeartbeat?.({
			...nextLease,
			mtimeMs: nextLease.heartbeatAt,
		});
	} finally {
		await handle.close();
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
	const reclaimGraceMs = Math.max(
		pollMs,
		Math.min(RECLAIM_GRACE_MS, staleMs),
	);
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
			const nowMs = Date.now();
			const initialLease = createLeasePayload(token, nowMs);
			const handle = await open(lockPath, 'wx');
			try {
				await handle.writeFile(serializeLeasePayload(initialLease));
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
				if (isLeaseStale(observedLease, Date.now(), staleMs)) {
					await withFileMutexTestHooks?.afterObserveStale?.(
						observedLease,
					);
					// A stale observation must survive a visible grace/recheck round
					// before we rename the lock away. That closes the window where a
					// live holder refreshed after observation and a third contender
					// could otherwise slip into an empty lock path.
					const markerPath = `${lockPath}.reclaim-marker.${process.pid}.${randomUUID()}`;
					await writeFile(
						markerPath,
						JSON.stringify({
							observedAt: Date.now(),
							observedGeneration: observedLease.generation,
							observedHeartbeatAt: observedLease.heartbeatAt,
							observedToken: observedLease.token,
						}),
					);
					try {
						await sleep(reclaimGraceMs);
						const recheckedLease = await observeLockLease(lockPath);
						if (recheckedLease === undefined) {
							continue;
						}
						if (
							!isLeaseStale(
								recheckedLease,
								Date.now(),
								staleMs,
							) ||
							!isSameLeaseObservation(
								recheckedLease,
								observedLease,
							)
						) {
							continue;
						}

						const reclaimPath = `${lockPath}.reclaim.${process.pid}.${randomUUID()}`;
						await rename(lockPath, reclaimPath);
						await withFileMutexTestHooks?.afterReclaimRename?.({
							reclaimPath,
							observedLease: recheckedLease,
						});
						const revalidatedLease =
							await observeLockLease(reclaimPath);
						if (
							revalidatedLease !== undefined &&
							isSameLeaseObservation(
								revalidatedLease,
								recheckedLease,
							)
						) {
							try {
								const handle = await open(lockPath, 'wx');
								try {
									await handle.writeFile(
										serializeLeasePayload(
											createLeasePayload(
												token,
												Date.now(),
											),
										),
									);
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
								await removeIfOwned(lockPath, token);
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
					} finally {
						await rm(markerPath, { force: true }).catch(
							() => undefined,
						);
					}
				}
			} catch (error) {
				// f00154/q00016 S5: only ENOENT (the sidecar vanished between
				// open and stat, or between rename and revalidate) is benign
				// and worth a retry. This catch also sits above the nested
				// reclaimError/guardError/commitError rethrows above, so an
				// unfiltered `catch { continue }` here would silently turn
				// THEIR already-correct propagation back into a retry too —
				// and because this `continue` re-enters the for(;;) loop
				// BEFORE the `deadline` check below, a persistent non-ENOENT
				// error (EACCES, EIO, EISDIR — e.g. a tampered or
				// permission-denied lock directory) doesn't even surface as
				// a bounded LockContentionError: it hangs forever.
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
					continue;
				}
				throw error;
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
	//
	// The tick must not overlap itself. `refreshLeaseHeartbeat` is a
	// read-modify-write (open → read generation → write generation + 1), and
	// a single `open`/`write` round trip routinely outlives `heartbeatMs`
	// under load. Two overlapping ticks then both read generation G and both
	// write G + 1, so the generation stops being monotonic — and two
	// concurrent writes to the same lease file can leave it partially
	// written, which parses back as an empty token. Both outcomes make a
	// live holder look stale to a reclaimer, which is precisely how two
	// holders end up inside the lock at once. Skipping a tick is safe: the
	// in-flight refresh is already writing a newer heartbeatAt.
	let heartbeatInFlight = false;
	const heartbeat = setInterval(() => {
		if (heartbeatInFlight) return;
		heartbeatInFlight = true;
		void refreshLeaseHeartbeat(lockPath, token)
			.catch(() => undefined)
			.finally(() => {
				heartbeatInFlight = false;
			});
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
					const current = await observeLockLease(lockPath);
					if (current?.token === token) {
						await rm(lockPath, { force: true });
					}
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
