import { basename, dirname, join } from 'node:path';

import { SafeWorkspaceReader } from '@mcp-vertex/core/public';

import type { ILockFile } from './agent-lock-engine';
import {
	deriveFileLockTablePath,
	listLocks,
	listRecentFileLockContentions,
} from './file-lock-table';

export interface IContentionEvent {
	readonly ts: string;
	readonly taskId: string;
	readonly agent: string;
	readonly files: readonly string[];
	readonly outcome: 'granted' | 'partial' | 'rejected';
}

export interface IContentionDetectorDeps {
	readonly eventLogPath: string;
	readonly now?: () => number;
	readonly thresholdMs?: number;
	readonly windowMs?: number;
}

export interface ILivelockReport {
	readonly detected: boolean;
	readonly reason: string;
	readonly events: readonly IContentionEvent[];
}

export interface ILivelockPair {
	readonly agentA: string;
	readonly agentB: string;
	readonly files: readonly string[];
	readonly heldMs: number;
}

const DEFAULT_THRESHOLD_MS = 5_000;
const DEFAULT_WINDOW_MS = 60_000;

const EMPTY_LOCK = (): ILockFile => ({
	version: 1,
	stale_after_minutes: 10,
	in_flight: [],
});

const readLockSnapshot = async (lockPath: string): Promise<ILockFile> => {
	let raw: string;
	try {
		raw = (
			await new SafeWorkspaceReader(dirname(lockPath)).readText(
				basename(lockPath),
			)
		).content;
	} catch {
		return EMPTY_LOCK();
	}
	try {
		const parsed = JSON.parse(raw) as Partial<ILockFile>;
		return {
			version: parsed.version ?? 1,
			stale_after_minutes: parsed.stale_after_minutes ?? 10,
			in_flight: Array.isArray(parsed.in_flight) ? parsed.in_flight : [],
		};
	} catch {
		return EMPTY_LOCK();
	}
};

const intersect = (
	left: readonly string[],
	right: readonly string[],
): string[] => {
	const rightSet = new Set(right);
	return left.filter((file) => rightSet.has(file)).sort();
};

const subtract = (
	left: readonly string[],
	right: readonly string[],
): string[] => {
	const rightSet = new Set(right);
	return left.filter((file) => !rightSet.has(file)).sort();
};

const defaultLockPathFromTable = (tablePath: string): string =>
	join(dirname(tablePath), 'agents.lock.json');

const noLivelock = (reason: string): ILivelockReport => ({
	detected: false,
	reason,
	events: [],
});

const alternating = (
	events: readonly IContentionEvent[],
	taskA: string,
	taskB: string,
): boolean => {
	if (events.length < 4) return false;
	let expected = events[0]?.taskId;
	if (expected !== taskA && expected !== taskB) return false;
	for (const event of events) {
		if (event.taskId !== expected) return false;
		expected = expected === taskA ? taskB : taskA;
	}
	return true;
};

const unionFilesForTask = (
	events: readonly IContentionEvent[],
	taskId: string,
): string[] => {
	const files = new Set<string>();
	for (const event of events) {
		if (event.taskId !== taskId) continue;
		for (const file of event.files) files.add(file);
	}
	return [...files].sort();
};

export const detectLivelock = (
	events: readonly IContentionEvent[],
	deps?: IContentionDetectorDeps,
): ILivelockReport => {
	const thresholdMs = deps?.thresholdMs ?? DEFAULT_THRESHOLD_MS;
	const windowMs = deps?.windowMs ?? DEFAULT_WINDOW_MS;
	if (events.length < 4) {
		return noLivelock(
			`no alternating two-task contention exceeded ${thresholdMs}ms`,
		);
	}

	const materialized = events
		.map((event) => ({ event, tsMs: Date.parse(event.ts) }))
		.filter(({ tsMs }) => Number.isFinite(tsMs))
		.sort((left, right) => left.tsMs - right.tsMs);
	if (materialized.length < 4) {
		return noLivelock('no valid contention timestamps were available');
	}

	const nowMs = deps?.now?.() ?? materialized[materialized.length - 1]!.tsMs;
	const relevant = materialized
		.filter(({ tsMs }) => nowMs - tsMs <= windowMs)
		.map(({ event }) => event)
		.filter((event) => event.outcome !== 'granted');
	if (relevant.length < 4) {
		return noLivelock(
			`no alternating two-task contention exceeded ${thresholdMs}ms in the last ${windowMs}ms`,
		);
	}

	const taskIds = [...new Set(relevant.map((event) => event.taskId))].sort();
	for (let leftIndex = 0; leftIndex < taskIds.length; leftIndex += 1) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < taskIds.length;
			rightIndex += 1
		) {
			const taskA = taskIds[leftIndex]!;
			const taskB = taskIds[rightIndex]!;
			const pairEvents = relevant.filter(
				(event) => event.taskId === taskA || event.taskId === taskB,
			);
			for (let start = 0; start <= pairEvents.length - 4; start += 1) {
				for (let end = start + 4; end <= pairEvents.length; end += 1) {
					const segment = pairEvents.slice(start, end);
					if (!alternating(segment, taskA, taskB)) continue;
					const startedAt = Date.parse(segment[0]!.ts);
					const finishedAt = Date.parse(
						segment[segment.length - 1]!.ts,
					);
					if (finishedAt - startedAt <= thresholdMs) continue;
					const filesA = unionFilesForTask(segment, taskA);
					const filesB = unionFilesForTask(segment, taskB);
					const sharedFiles = intersect(filesA, filesB);
					if (sharedFiles.length === 0) continue;
					if (subtract(filesA, filesB).length === 0) continue;
					if (subtract(filesB, filesA).length === 0) continue;
					if (
						!segment.every((event) =>
							sharedFiles.some((file) =>
								event.files.includes(file),
							),
						)
					) {
						continue;
					}
					return {
						detected: true,
						reason: `alternating contention between ${taskA} and ${taskB} persisted for ${finishedAt - startedAt}ms on shared files: ${sharedFiles.join(', ')}`,
						events: segment,
					};
				}
			}
		}
	}

	return noLivelock(
		`no alternating two-task contention exceeded ${thresholdMs}ms in the last ${windowMs}ms`,
	);
};

export const detectContention = async (
	opts: {
		readonly windowMs?: number;
		readonly lockPath?: string;
		readonly fileLockTablePath?: string;
		readonly now?: () => number;
	} = {},
): Promise<{ livelocks: readonly ILivelockPair[] }> => {
	const tablePath = deriveFileLockTablePath(
		opts.lockPath,
		opts.fileLockTablePath,
	);
	const lockPath = opts.lockPath ?? defaultLockPathFromTable(tablePath);
	const table = await listLocks({ tablePath });
	const history = await listRecentFileLockContentions({
		tablePath,
		...(opts.now !== undefined
			? { now: () => new Date(opts.now!()).toISOString() }
			: {}),
	});
	const lock = await readLockSnapshot(lockPath);
	const nowMs = (opts.now ?? Date.now)();
	const livelocks: ILivelockPair[] = [];
	const seen = new Set<string>();

	for (let index = 0; index < lock.in_flight.length; index += 1) {
		const left = lock.in_flight[index];
		if (left === undefined) continue;
		for (
			let otherIndex = index + 1;
			otherIndex < lock.in_flight.length;
			otherIndex += 1
		) {
			const right = lock.in_flight[otherIndex];
			if (right === undefined) continue;
			if (left.agent === right.agent) continue;
			const overlap = intersect(left.ownership, right.ownership);
			if (overlap.length === 0) continue;
			const heldAges = overlap
				.map((file) => {
					const entry = table[file];
					if (entry === undefined) return null;
					const mtime = new Date(entry.mtime).getTime();
					if (Number.isNaN(mtime)) return null;
					return nowMs - mtime;
				})
				.filter((value): value is number => value !== null);
			if (heldAges.length !== overlap.length) continue;
			const heldMs = Math.min(...heldAges);
			if (heldMs <= (opts.windowMs ?? DEFAULT_THRESHOLD_MS)) continue;
			const pair = [left.agent, right.agent].sort();
			const key = `${pair.join('::')}::${overlap.join(',')}`;
			if (seen.has(key)) continue;
			seen.add(key);
			livelocks.push({
				agentA: pair[0] ?? '',
				agentB: pair[1] ?? '',
				files: overlap,
				heldMs,
			});
		}
	}

	livelocks.sort((a, b) => {
		const byA = a.agentA.localeCompare(b.agentA);
		if (byA !== 0) return byA;
		const byB = a.agentB.localeCompare(b.agentB);
		if (byB !== 0) return byB;
		return a.files.join(',').localeCompare(b.files.join(','));
	});

	for (const entry of history) {
		if (entry.kind !== 'disjoint') continue;
		if (entry.resolvedAt !== undefined) continue;
		const startedMs = new Date(entry.startedAt).getTime();
		if (Number.isNaN(startedMs)) continue;
		const resolvedMs =
			entry.resolvedAt === undefined
				? null
				: new Date(entry.resolvedAt).getTime();
		if (
			resolvedMs !== null &&
			!Number.isNaN(resolvedMs) &&
			nowMs - resolvedMs > (opts.windowMs ?? DEFAULT_WINDOW_MS)
		) {
			continue;
		}
		const heldMs =
			(resolvedMs === null || Number.isNaN(resolvedMs)
				? nowMs
				: resolvedMs) - startedMs;
		if (heldMs <= (opts.windowMs ?? DEFAULT_THRESHOLD_MS)) continue;
		const pair = [entry.holderAgentId, entry.waitingAgentId].sort();
		const key = `${pair.join('::')}::${[...entry.files].sort().join(',')}`;
		if (seen.has(key)) continue;
		seen.add(key);
		livelocks.push({
			agentA: pair[0] ?? '',
			agentB: pair[1] ?? '',
			files: [...entry.files].sort(),
			heldMs,
		});
	}

	livelocks.sort((a, b) => {
		const byA = a.agentA.localeCompare(b.agentA);
		if (byA !== 0) return byA;
		const byB = a.agentB.localeCompare(b.agentB);
		if (byB !== 0) return byB;
		return a.files.join(',').localeCompare(b.files.join(','));
	});

	return { livelocks };
};

// TODO(a00072-S8): cuando state_health vuelva a caer dentro de un slice
// propio, conectar detectLivelock() al stream real de eventos de claim/reject.
