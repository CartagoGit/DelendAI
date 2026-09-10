import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';
import { stat } from 'node:fs/promises';

import { isLockEntryExpired } from '@delendai/core/public';

import { lockExpiryPolicyFor } from './lock-expiry-policy';
import { SafeWorkspaceReader } from '@delendai/core/public';

/**
 * `fs/promises.stat` rejects on ENOENT; we only care whether the path
 * exists. Exported for `handoff-watcher.ts`, which was split out of this
 * file and needs the same check before handing a path to `fs.watch` —
 * shared rather than copied.
 */
export const pathExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

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
	last_seen?: string;
	host?: string;
	pid?: number;
}

/**
 * Read the current in-flight claims keyed by task_id. Missing/corrupt
 * lock file → empty map (the notifier never throws; a torn file just
 * means "nothing to compare yet").
 */
export const readInFlight = async (
	lockFile: string,
): Promise<Map<string, IReleasedClaim>> => {
	const map = new Map<string, IReleasedClaim>();
	try {
		const raw = (
			await new SafeWorkspaceReader(dirname(lockFile)).readText(
				basename(lockFile),
			)
		).content;
		const parsed = JSON.parse(raw) as {
			in_flight?: ILockEntryLite[];
			stale_after_minutes?: number;
		};
		// Expired claims are NOT in flight. Waiting on one means waiting
		// for an agent that stopped working — for the whole timeout, while
		// the lock engine has already handed the files to someone else. A
		// lock that is simultaneously free and held is the worst possible
		// answer to give an agent deciding what to do next, so both
		// readers use the same rule from core.
		const policy = lockExpiryPolicyFor(parsed.stale_after_minutes);
		for (const entry of parsed.in_flight ?? []) {
			if (typeof entry.task_id !== 'string') continue;
			if (isLockEntryExpired(entry, policy)) continue;
			map.set(entry.task_id, {
				taskId: entry.task_id,
				agent: entry.agent ?? 'unknown',
				files: entry.ownership ?? [],
			});
		}
	} catch {
		// missing/corrupt/unreadable → treat as empty (no false releases)
	}
	return map;
};

/** Tasks present in `prev` but absent in `curr` = releases. */
export const diffReleased = (
	prev: Map<string, IReleasedClaim>,
	curr: Map<string, IReleasedClaim>,
): IReleasedClaim[] => {
	const released: IReleasedClaim[] = [];
	for (const [taskId, claim] of prev) {
		if (!curr.has(taskId)) released.push(claim);
	}
	return released;
};

export interface IReleaseWatcher {
	/** Re-scan now; returns (and reports) any releases since the last scan. */
	check(): Promise<IReleasedClaim[]>;
	start(): void;
	stop(): void;
}

export interface IAwaitLockResult {
	/** The lock for `taskId` is free (released, or never held). */
	readonly released: boolean;
	/** The wait hit `timeoutMs` before the lock freed. */
	readonly timedOut: boolean;
	/** Milliseconds spent waiting. */
	readonly waitedMs: number;
	/** True when the lock was already free on entry (no waiting). */
	readonly alreadyFree: boolean;
}

const clampTimeout = (ms: number | undefined): number =>
	Math.max(1_000, Math.min(120_000, Math.floor(ms ?? 30_000)));

/**
 * Resolve when the lock for `taskId` is released (no longer in-flight), or on
 * timeout. This closes the "wait, don't poll" loop the knowledge promises: an
 * agent that hit `lock-conflict` calls this once and is woken by the same
 * directory watch the notifier uses (with a polling fallback), instead of
 * burning N `agent_lock status` round-trips. Never throws; always resolves.
 */
export const awaitLockRelease = (params: {
	readonly lockFile: string;
	readonly taskId: string;
	readonly timeoutMs?: number;
	readonly pollMs?: number;
	readonly signal?: AbortSignal;
}): Promise<IAwaitLockResult> => {
	const timeoutMs = clampTimeout(params.timeoutMs);
	const pollMs = Math.max(100, Math.min(5_000, params.pollMs ?? 500));
	// Monotonic clock: `Date.now()` can step backwards under NTP/clock
	// adjustments, which made `waitedMs` go negative in flaky test runs.
	const startedAt = performance.now();
	const isFree = async (): Promise<boolean> =>
		!(await readInFlight(params.lockFile)).has(params.taskId);

	return new Promise<IAwaitLockResult>((resolve) => {
		let settled = false;
		let timer: ReturnType<typeof setInterval> | undefined;
		let deadline: ReturnType<typeof setTimeout> | undefined;
		let fsWatcher: FSWatcher | undefined;
		// Serializes poll ticks: an `fs.watch` callback firing while a check
		// is already in flight skips the tick instead of overlapping it.
		let pollInFlight = false;
		const onAbort = (): void => finish(false, false);

		const finish = (released: boolean, timedOut: boolean): void => {
			if (settled) return;
			settled = true;
			if (timer) clearInterval(timer);
			if (deadline) clearTimeout(deadline);
			if (fsWatcher) fsWatcher.close();
			params.signal?.removeEventListener('abort', onAbort);
			resolve({
				released,
				timedOut,
				waitedMs: Math.round(performance.now() - startedAt),
				alreadyFree: false,
			});
		};
		const poll = (): void => {
			if (pollInFlight || settled) return;
			pollInFlight = true;
			void isFree()
				.then((free) => {
					if (free) finish(true, false);
				})
				.finally(() => {
					pollInFlight = false;
				});
		};

		void (async (): Promise<void> => {
			if (await isFree()) {
				resolve({
					released: true,
					timedOut: false,
					waitedMs: 0,
					alreadyFree: true,
				});
				return;
			}
			if (settled) return;

			timer = setInterval(poll, pollMs);
			timer.unref?.();
			deadline = setTimeout(() => finish(false, true), timeoutMs);
			deadline.unref?.();
			try {
				const dir = dirname(params.lockFile);
				if (await pathExists(dir)) fsWatcher = watch(dir, poll);
			} catch {
				// fs.watch unsupported here → polling fallback covers it.
			}
			if (params.signal?.aborted) finish(false, false);
			else params.signal?.addEventListener('abort', onAbort);
		})();
	});
};

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
	/**
	 * Fired once the baseline exists, i.e. after the first `check()`
	 * completes — which `start()` triggers eagerly.
	 *
	 * `start()` is sync but its priming is not, so from the outside there
	 * is no way to tell "the baseline is established" from "the baseline
	 * is still being read". A test that writes a release while priming is
	 * still in flight has that release absorbed into the baseline and
	 * sees nothing, which is a property of the race and not of the code
	 * under test. This makes the moment observable so such a test can
	 * wait for a condition instead of guessing at a sleep.
	 */
	readonly onPrimed?: () => void;
}): IReleaseWatcher => {
	// Lazily established on the first `check()` (the factory itself stays
	// sync; reading the lock file is deferred to fs/promises).
	let prev: Map<string, IReleasedClaim> | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let fsWatcher: FSWatcher | undefined;
	// Serializes ticks: a `setInterval`/`fs.watch` callback firing while a
	// scan is already in flight skips the tick instead of overlapping it.
	let checkInFlight = false;
	// Whether the baseline has been established at least once; drives
	// `onPrimed`. Reset by `stop()` alongside `prev`, which it mirrors.
	let primed = false;

	const check = async (): Promise<IReleasedClaim[]> => {
		const curr = await readInFlight(params.lockFile);
		const released = prev ? diffReleased(prev, curr) : [];
		prev = curr;
		if (!primed) {
			primed = true;
			params.onPrimed?.();
		}
		if (released.length > 0) params.onRelease(released);
		return released;
	};

	const tick = (): void => {
		if (checkInFlight) return;
		checkInFlight = true;
		void check().finally(() => {
			checkInFlight = false;
		});
	};

	const start = (): void => {
		const intervalMs = params.intervalMs ?? 2_000;
		timer = setInterval(tick, intervalMs);
		// Don't keep the process alive just for the notifier.
		timer.unref?.();
		// a00084 F14: prime `prev` immediately instead of waiting for the
		// first interval tick (up to `intervalMs`, default 2s, away). A
		// release that happens in that window — very plausible right after
		// a peer's watcher boots in a multi-agent swarm — used to be
		// swallowed into the baseline and never reported. This first tick()
		// still emits nothing (prev is still undefined when it runs), it
		// just runs as early as possible instead of waiting on the timer.
		tick();
		void (async (): Promise<void> => {
			try {
				const dir = dirname(params.lockFile);
				if (await pathExists(dir)) {
					fsWatcher = watch(dir, tick);
				}
			} catch {
				// fs.watch unsupported here → polling fallback already covers it.
			}
		})();
	};

	const stop = (): void => {
		if (timer) clearInterval(timer);
		if (fsWatcher) fsWatcher.close();
		timer = undefined;
		fsWatcher = undefined;
		// a00085 #7: a later start() must re-prime the baseline, not
		// diff against pre-stop in-flight claims (false lock-released).
		prev = undefined;
		primed = false;
		checkInFlight = false;
	};

	return { check, start, stop };
};
