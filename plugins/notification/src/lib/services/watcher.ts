import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { isLockEntryExpired } from '@mcp-vertex/core/lib/shared/lock-entry-expiry';
import { SafeWorkspaceReader } from '@mcp-vertex/core/public';

/** `fs/promises.stat` rejects on ENOENT; we only care whether the path exists. */
const pathExists = async (path: string): Promise<boolean> => {
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
 * Default when the lock file does not declare its own window. Mirrors
 * the engine's default; the file's own `stale_after_minutes` wins
 * whenever it is present, so the two cannot drift apart in practice.
 */
const DEFAULT_STALE_AFTER_MINUTES = 10;

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
		const policy = {
			staleAfterMinutes:
				typeof parsed.stale_after_minutes === 'number'
					? parsed.stale_after_minutes
					: DEFAULT_STALE_AFTER_MINUTES,
			host: hostname(),
			isProcessAlive: (pid: number): boolean => {
				try {
					process.kill(pid, 0);
					return true;
				} catch (error) {
					// ESRCH is the only answer that proves the owner is
					// gone; EPERM means it exists but is not ours.
					return (error as NodeJS.ErrnoException).code !== 'ESRCH';
				}
			},
		};
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
}): IReleaseWatcher => {
	// Lazily established on the first `check()` (the factory itself stays
	// sync; reading the lock file is deferred to fs/promises).
	let prev: Map<string, IReleasedClaim> | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let fsWatcher: FSWatcher | undefined;
	// Serializes ticks: a `setInterval`/`fs.watch` callback firing while a
	// scan is already in flight skips the tick instead of overlapping it.
	let checkInFlight = false;

	const check = async (): Promise<IReleasedClaim[]> => {
		const curr = await readInFlight(params.lockFile);
		const released = prev ? diffReleased(prev, curr) : [];
		prev = curr;
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
		checkInFlight = false;
	};

	return { check, start, stop };
};

export interface IHandoffEvent {
	readonly file: string;
	readonly agent: string;
	readonly reason: string;
	readonly handoffPath: string;
}

export interface IHandoffWatcher {
	check(): Promise<IHandoffEvent[]>;
	start(): void;
	stop(): void;
}

export const createHandoffWatcher = (params: {
	readonly handoffDir: string;
	readonly onHandoff: (events: readonly IHandoffEvent[]) => void;
	readonly intervalMs?: number;
}): IHandoffWatcher => {
	const seenFiles = new Set<string>();
	// The first `check()` call populates `seenFiles` from whatever already
	// exists in the directory without emitting events for it — equivalent
	// to the old constructor-time sync pre-scan, just deferred to the first
	// async tick (the factory itself stays sync).
	let primed = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let fsWatcher: FSWatcher | undefined;
	// Serializes ticks: a `setInterval`/`fs.watch` callback firing while a
	// scan is already in flight skips the tick instead of overlapping it.
	let checkInFlight = false;

	const listJsonFiles = async (): Promise<string[]> => {
		try {
			const files = await readdir(params.handoffDir);
			return files.filter((file) => file.endsWith('.json'));
		} catch {
			return [];
		}
	};

	const check = async (): Promise<IHandoffEvent[]> => {
		const events: IHandoffEvent[] = [];

		if (!primed) {
			primed = true;
			for (const file of await listJsonFiles()) seenFiles.add(file);
			return events;
		}

		for (const file of await listJsonFiles()) {
			if (seenFiles.has(file)) continue;
			seenFiles.add(file);
			const pathAbs = join(params.handoffDir, file);
			try {
				const content = (
					await new SafeWorkspaceReader(params.handoffDir).readText(
						file,
					)
				).content;
				const parsed = JSON.parse(content);
				if (
					parsed &&
					typeof parsed.schema === 'string' &&
					parsed.schema.startsWith('mcp-vertex/handoff/')
				) {
					events.push({
						file,
						agent: parsed.from?.agent ?? 'unknown',
						reason: parsed.reason ?? 'unknown',
						handoffPath: pathAbs,
					});
				}
			} catch {
				// File might be in the middle of being written, remove from seen
				seenFiles.delete(file);
			}
		}

		if (events.length > 0) {
			params.onHandoff(events);
		}
		return events;
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
		timer.unref?.();
		// Prime `seenFiles` before the first interval tick so pre-existing
		// files never appear as "new" once polling begins.
		void check();

		void (async (): Promise<void> => {
			try {
				if (await pathExists(params.handoffDir)) {
					fsWatcher = watch(params.handoffDir, tick);
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
	};

	return { check, start, stop };
};
