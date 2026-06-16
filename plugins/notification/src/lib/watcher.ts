import { existsSync, readFileSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { dirname } from 'node:path';

/** A claim that was released (present last scan, gone this scan). */
export interface IReleasedClaim {
	readonly taskId: string;
	readonly agent: string;
	readonly files: readonly string[];
}

interface ILockEntryLite {
	task_id?: string;
	agent?: string;
	ownership?: string[];
}

/**
 * Read the current in-flight claims keyed by task_id. Missing/corrupt
 * lock file → empty map (the notifier never throws; a torn file just
 * means "nothing to compare yet").
 */
export const readInFlight = (lockFile: string): Map<string, IReleasedClaim> => {
	const map = new Map<string, IReleasedClaim>();
	if (!existsSync(lockFile)) return map;
	try {
		const parsed = JSON.parse(readFileSync(lockFile, 'utf8')) as {
			in_flight?: ILockEntryLite[];
		};
		for (const entry of parsed.in_flight ?? []) {
			if (typeof entry.task_id === 'string') {
				map.set(entry.task_id, {
					taskId: entry.task_id,
					agent: entry.agent ?? 'unknown',
					files: entry.ownership ?? [],
				});
			}
		}
	} catch {
		// corrupt/unreadable → treat as empty (no false releases)
	}
	return map;
};

/** Tasks present in `prev` but absent in `curr` = releases. */
export const diffReleased = (
	prev: Map<string, IReleasedClaim>,
	curr: Map<string, IReleasedClaim>
): IReleasedClaim[] => {
	const released: IReleasedClaim[] = [];
	for (const [taskId, claim] of prev) {
		if (!curr.has(taskId)) released.push(claim);
	}
	return released;
};

export interface IReleaseWatcher {
	/** Re-scan now; returns (and reports) any releases since the last scan. */
	check(): IReleasedClaim[];
	start(): void;
	stop(): void;
}

/**
 * Watch a shared lock file and report releases. One local watch per
 * server replaces N agents polling `agent_lock status` over MCP — that
 * is the token win. Event-driven via `fs.watch` on the lock's directory
 * (atomic writes replace the file by rename, so we watch the dir, not
 * the inode) with a polling fallback for filesystems where `fs.watch`
 * is unreliable (some containers / network mounts).
 */
export const createReleaseWatcher = (params: {
	readonly lockFile: string;
	readonly onRelease: (released: readonly IReleasedClaim[]) => void;
	readonly intervalMs?: number;
}): IReleaseWatcher => {
	let prev = readInFlight(params.lockFile);
	let timer: ReturnType<typeof setInterval> | undefined;
	let fsWatcher: FSWatcher | undefined;

	const check = (): IReleasedClaim[] => {
		const curr = readInFlight(params.lockFile);
		const released = diffReleased(prev, curr);
		prev = curr;
		if (released.length > 0) params.onRelease(released);
		return released;
	};

	const start = (): void => {
		const intervalMs = params.intervalMs ?? 2_000;
		timer = setInterval(check, intervalMs);
		// Don't keep the process alive just for the notifier.
		timer.unref?.();
		try {
			const dir = dirname(params.lockFile);
			if (existsSync(dir)) {
				fsWatcher = watch(dir, () => {
					check();
				});
			}
		} catch {
			// fs.watch unsupported here → polling fallback already covers it.
		}
	};

	const stop = (): void => {
		if (timer) clearInterval(timer);
		if (fsWatcher) fsWatcher.close();
		timer = undefined;
		fsWatcher = undefined;
	};

	return { check, start, stop };
};
