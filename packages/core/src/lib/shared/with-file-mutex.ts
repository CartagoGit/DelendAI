import { mkdir, open, rm, stat } from 'node:fs/promises';
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
 * sidecar `<target>.mutex` already exists. The holder removes the
 * sidecar on exit (even on throw). A sidecar older than `staleMs` is
 * considered abandoned (the holder crashed) and stolen; if contention
 * outlasts `timeoutMs` the lock is stolen too, so a hung peer can never
 * deadlock the swarm.
 *
 * In the common single-process case there is no contention: the first
 * `open` succeeds immediately, so the wrapper is transparent.
 */
export interface IFileMutexOptions {
	/** Wait at most this long before stealing the lock (ms). Default 5000. */
	readonly timeoutMs?: number;
	/** A held lock older than this is treated as abandoned (ms). Default 30000. */
	readonly staleMs?: number;
	/** Poll interval between acquisition attempts (ms). Default 25. */
	readonly pollMs?: number;
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
	const lockPath = `${targetPath}.mutex`;

	await mkdir(dirname(targetPath), { recursive: true });

	const deadline = Date.now() + timeoutMs;
	let acquired = false;
	for (;;) {
		try {
			const handle = await open(lockPath, 'wx');
			try {
				await handle.writeFile(`${process.pid}\n${Date.now()}`);
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
				await rm(lockPath, { force: true }).catch(() => undefined);
				continue;
			}
			await sleep(pollMs);
		}
	}

	try {
		return await fn();
	} finally {
		if (acquired) await rm(lockPath, { force: true }).catch(() => undefined);
	}
};
