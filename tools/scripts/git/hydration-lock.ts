/**
 * hydration-lock.ts — one hydration at a time.
 *
 * The post-merge hook starts a background hydration each time the
 * integration branch moves, and it can fire twice within seconds. Two
 * runs then brought the same head of the queue forward in parallel: one
 * pushed, the other was refused, and both asked the queue to run. The
 * lock makes the second one step aside and leave a note instead; the
 * holder reads the note when it finishes and goes round once more, so a
 * move of the integration branch during a run is not lost.
 */
import {
	existsSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
	closeSync,
} from 'node:fs';
import { join } from 'node:path';

const LOCK = 'hydrate-candidates.lock';
const AGAIN = 'hydrate-candidates.again';

const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

/**
 * Take the lock, or report that a live run holds it (and ask that run to
 * go round again). A lock left by a process that no longer exists is
 * taken over.
 */
export const acquireHydrationLock = (
	dir: string,
	pid: number = process.pid,
): 'acquired' | 'busy' => {
	const path = join(dir, LOCK);
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const fd = openSync(path, 'wx');
			writeFileSync(fd, String(pid));
			closeSync(fd);
			return 'acquired';
		} catch {
			const holder = Number(readFileSync(path, 'utf8').trim());
			if (Number.isInteger(holder) && holder > 0 && alive(holder)) {
				writeFileSync(join(dir, AGAIN), String(pid));
				return 'busy';
			}
			rmSync(path, { force: true });
		}
	}
	return 'busy';
};

/** True, once, when another run asked the holder to go round again. */
export const takeRerunRequest = (dir: string): boolean => {
	const path = join(dir, AGAIN);
	if (!existsSync(path)) return false;
	rmSync(path, { force: true });
	return true;
};

export const releaseHydrationLock = (dir: string): void => {
	rmSync(join(dir, LOCK), { force: true });
};

/**
 * Run `work` while holding the lock, and never leave a rerun request
 * behind. The request is checked AFTER the lock is released, then the
 * lock is taken again for the rerun: a run that arrived while the lock
 * was held left the note and is seen here; one that arrived after the
 * release found no lock and ran itself. Checking before the release, as
 * the first version did, left a window in which a note could be written
 * after the last check and read by nobody.
 */
export const runExclusively = (
	dir: string,
	work: () => void,
	pid: number = process.pid,
): 'ran' | 'deferred' => {
	if (acquireHydrationLock(dir, pid) === 'busy') return 'deferred';
	for (;;) {
		try {
			work();
		} finally {
			releaseHydrationLock(dir);
		}
		if (!takeRerunRequest(dir)) return 'ran';
		if (acquireHydrationLock(dir, pid) === 'busy') return 'ran';
	}
};
