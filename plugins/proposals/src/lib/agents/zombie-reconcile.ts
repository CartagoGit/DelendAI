import { realpath } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';
import { runAgentLockEngine } from '../locks/agent-lock-engine';
import { createAgentRegistryStore } from '../shared/agent-registry-store';
import type { IAgentRegistry } from '../shared/agent-registry-store';

export type IAgentSlot = string;

export interface IZombieOrphanEntry {
	readonly agentName: string;
	readonly taskId: string;
	readonly agentSlot: IAgentSlot;
	readonly lastSeen: string; // ISO8601
	readonly ageMinutes: number;
	readonly reason: IZombieReason;
	readonly recommendedAction: IZombieRecommendedAction;
}

export interface IZombieReconcileReport {
	readonly scannedAt: string; // ISO8601
	readonly staleAfterMinutes: number;
	readonly orphans: readonly IZombieOrphanEntry[];
	readonly threshold: IZombieThreshold;
	readonly recommendation: string;
	/** R-2026-08-31: count of stale locks released during this reconcile. */
	readonly releasedLockCount?: number;
}

export type IZombieThreshold = 'green' | 'yellow' | 'red';

export type IZombieReason =
	| 'cooldown_null' // cooldown_until: null + adopted: true
	| 'stale_no_lock' // age > stale_after_minutes, no lock entry
	| 'stale_with_orphaned_lock' // age > stale_after_minutes, lock entry también rancia
	/** a00069 S6: assignment already marked `status: orphan`. */
	| 'status_orphan'
	/** a00069 S6: `adopted: false` past the orphan TTL (default 7d). */
	| 'stale_not_adopted'
	/** Subscription lease expired without a renewal heartbeat. */
	| 'lease_expired';

export type IZombieRecommendedAction =
	| 'force_release' // eliminar del registry + emitir evento
	| 'extend_cooldown' // fijar cooldown_until = now + 7d (solo si hay señales de actividad reciente)
	| 'escalate'; // lock bloqueado activamente o condición ambigua

export type IQueueEventEmitter = (
	taskId: string,
	priority: number,
) => Promise<void>;

/** a00069 S6: default TTL for non-adopted / leftover registry rows (7 days). */
export const DEFAULT_ORPHAN_TTL_MINUTES = 7 * 24 * 60;
/** Default staleness window for adopted-but-dormant agents. */
export const DEFAULT_STALE_AFTER_MINUTES = 10;

/**
 * Read a lock file through `SafeWorkspaceReader`, rooted at the lock's
 * own realpath'd directory. Returns `null` when the file is missing or
 * unreadable — callers treat that as "no lock on disk".
 */
const readLockText = async (lockPath: string): Promise<string | null> => {
	try {
		const rootAbs = await realpath(dirname(lockPath)).catch(() =>
			dirname(lockPath),
		);
		return (
			await new SafeWorkspaceReader(rootAbs).readText(basename(lockPath))
		).content;
	} catch {
		return null;
	}
};

const loadLockSnapshotLocal = async (
	lockPath: string,
): Promise<{
	in_flight: Array<{ task_id: string; agent: string; claimed_at: string }>;
}> => {
	// The reader is rooted at the lock's own directory, so containment is
	// satisfied by construction — but only once the root is a REAL path.
	// Test fixtures live under `/tmp`, which is a symlink on some hosts,
	// and the realpath-validated containment check then sees the resolved
	// file escape the unresolved root. Resolving the root first keeps a
	// single read path (no `node:fs` fallback, per the architecture lint).
	const raw = await readLockText(lockPath);
	if (raw === null) {
		// Missing/unreadable lock → no in-flight claims.
		return { in_flight: [] };
	}
	try {
		const parsed = JSON.parse(raw);
		const in_flight = (
			Array.isArray(parsed?.in_flight) ? parsed.in_flight : []
		).map((x: unknown) => {
			const item = x as Record<string, unknown>;
			return {
				task_id: typeof item.task_id === 'string' ? item.task_id : '',
				agent: typeof item.agent === 'string' ? item.agent : '',
				// `claimed_at` here is a local abstraction for "lock claim
				// time"; on disk the canonical field is `started_at` (M7
				// dropped the old `claimed_at` disk field). `last_seen` is a
				// last-resort fallback for a lock missing `started_at`.
				claimed_at: String(item.started_at ?? item.last_seen ?? ''),
			};
		});
		return { in_flight };
	} catch {
		return { in_flight: [] };
	}
};

export function thresholdFromOrphans(count: number): IZombieThreshold {
	if (count === 0) return 'green';
	if (count <= 2) return 'yellow';
	return 'red';
}

export function classifyZombies(
	registry: IAgentRegistry,
	lockSnapshot: {
		in_flight: ReadonlyArray<{
			readonly task_id: string;
			readonly claimed_at: string;
		}>;
	},
	now?: Date,
	staleAfterMinutes = DEFAULT_STALE_AFTER_MINUTES,
	/**
	 * a00069 S6: TTL for non-adopted assignments (and how long a
	 * `status: orphan` row may linger before force-release when last_seen
	 * is unparseable). Default 7 days.
	 */
	orphanTtlMinutes: number = DEFAULT_ORPHAN_TTL_MINUTES,
): IZombieReconcileReport {
	const checkTime = now || new Date();
	const checkMs = checkTime.getTime();
	const orphans: IZombieOrphanEntry[] = [];

	for (const a of registry.assignments) {
		const lastSeenTime = Date.parse(a.last_seen);
		const leaseUntil =
			typeof a.lease_until === 'string'
				? Date.parse(a.lease_until)
				: Number.NaN;
		const ageMinutes = Number.isNaN(lastSeenTime)
			? Number.POSITIVE_INFINITY
			: (checkMs - lastSeenTime) / 60_000;
		const lastSeen =
			typeof a.last_seen === 'string' && a.last_seen.length > 0
				? a.last_seen
				: 'unknown';

		// a00069 S6: explicit orphan rows always purge.
		if (a.status === 'orphan') {
			orphans.push({
				agentName: a.agent_name,
				taskId: a.task_id,
				agentSlot: a.agent_slot,
				lastSeen,
				ageMinutes: Number.isFinite(ageMinutes) ? ageMinutes : 0,
				reason: 'status_orphan',
				recommendedAction: 'force_release',
			});
			continue;
		}

		// Subscription leases are authoritative for new assignments, including
		// pooled names where `adopted` is false.
		if (!Number.isNaN(leaseUntil) && checkMs >= leaseUntil) {
			orphans.push({
				agentName: a.agent_name,
				taskId: a.task_id,
				agentSlot: a.agent_slot,
				lastSeen,
				ageMinutes: Number.isFinite(ageMinutes) ? ageMinutes : 0,
				reason: 'lease_expired',
				recommendedAction: 'force_release',
			});
			continue;
		}

		// a00069 S6: never-adopted leftovers past the long TTL.
		if (a.adopted !== true) {
			if (ageMinutes > orphanTtlMinutes) {
				orphans.push({
					agentName: a.agent_name,
					taskId: a.task_id,
					agentSlot: a.agent_slot,
					lastSeen,
					ageMinutes: Number.isFinite(ageMinutes) ? ageMinutes : 0,
					reason: 'stale_not_adopted',
					recommendedAction: 'force_release',
				});
			}
			continue;
		}

		if (Number.isNaN(lastSeenTime)) {
			continue;
		}
		if (ageMinutes <= staleAfterMinutes) {
			continue;
		}

		const lockEntry = lockSnapshot.in_flight.find(
			(le) => le.task_id === a.task_id,
		);

		if (!lockEntry) {
			const reason: IZombieReason =
				a.status === 'cooldown' && a.cooldown_until === null
					? 'cooldown_null'
					: 'stale_no_lock';

			orphans.push({
				agentName: a.agent_name,
				taskId: a.task_id,
				agentSlot: a.agent_slot,
				lastSeen: a.last_seen,
				ageMinutes,
				reason,
				recommendedAction: 'force_release',
			});
		} else {
			const lockClaimTime = Date.parse(lockEntry.claimed_at);
			if (!Number.isNaN(lockClaimTime)) {
				const lockAgeMinutes = (checkMs - lockClaimTime) / 60_000;
				if (lockAgeMinutes > staleAfterMinutes) {
					orphans.push({
						agentName: a.agent_name,
						taskId: a.task_id,
						agentSlot: a.agent_slot,
						lastSeen: a.last_seen,
						ageMinutes,
						reason: 'stale_with_orphaned_lock',
						recommendedAction: 'force_release',
					});
				}
			}
		}
	}

	const threshold = thresholdFromOrphans(orphans.length);
	const recommendation =
		orphans.length === 0
			? 'No zombies detected.'
			: `${orphans.length} zombie(s) detected. Recommended action: run <prefix>_state_repair { mode: "execute" } (or agent_names reconcile) to clean up.`;

	return {
		scannedAt: checkTime.toISOString(),
		staleAfterMinutes,
		orphans,
		threshold,
		recommendation,
	};
}

export async function gcZombies(
	registryPath: string,
	lockPath: string,
	_queuePath: string,
	options?: {
		dryRun?: boolean | undefined;
		staleAfterMinutes?: number | undefined;
		/** a00069 S6: TTL for non-adopted assignments (minutes). */
		orphanTtlMinutes?: number | undefined;
		now?: Date | undefined;
		queueEmitter?: IQueueEventEmitter | undefined;
	},
): Promise<IZombieReconcileReport> {
	const store = createAgentRegistryStore(registryPath);
	const registry = await store.read();
	const lockSnapshot = await loadLockSnapshotLocal(lockPath);

	const now = options?.now || new Date();
	const staleAfterMinutes =
		options?.staleAfterMinutes ?? DEFAULT_STALE_AFTER_MINUTES;
	const orphanTtlMinutes =
		options?.orphanTtlMinutes ?? DEFAULT_ORPHAN_TTL_MINUTES;

	const report = classifyZombies(
		registry,
		lockSnapshot,
		now,
		staleAfterMinutes,
		orphanTtlMinutes,
	);

	if (options?.dryRun !== true && report.orphans.length > 0) {
		let mutated = false;
		let releasedLockCount = 0;
		for (const orphan of report.orphans) {
			if (orphan.recommendedAction === 'force_release') {
				const before = registry.assignments.length;
				registry.assignments = registry.assignments.filter(
					(a) => a.task_id !== orphan.taskId,
				);
				if (registry.assignments.length < before) {
					mutated = true;
				}

				const lockEntry = lockSnapshot.in_flight.find(
					(entry) => entry.task_id === orphan.taskId,
				);
				let releasedLock = false;
				if (lockEntry !== undefined) {
					const releaseResult = await runAgentLockEngine(
						{
							action: 'release',
							task_id: orphan.taskId,
							agent: lockEntry.agent,
						},
						{
							lockPath,
							// Forward `now` so the lock engine's stale
							// filter uses the same instant the
							// reconcile was running with (tests inject
							// historical timestamps; production uses
							// the default `Date.now()`).
							...(options?.now !== undefined
								? {
										now: () => options.now!.toISOString(),
									}
								: {}),
						},
					);
					// R-2026-08-31: only emit the watchdog event when we
					// actually freed a lock. `runAgentLockEngine`'s
					// release action reports `ok: true` even when no
					// entry matched — the honest signal is `removed > 0`
					// (per `releaseSliceLock` in `authoring.tool.ts`).
					// Emitting on every `force_release` (even when no
					// lock existed) flooded the queue with phantom
					// events for orphan / lease-expired / cooldown_null
					// rows whose registry row is gone but whose task ID
					// is already free. The result was a backpressure RED
					// threshold with 11+ queued events that the watchdog
					// could never resolve because no zombie was actually
					// behind them.
					const body = JSON.parse(
						releaseResult.content[0]?.text ?? '{}',
					) as { ok?: boolean; removed?: number };
					// Edge case: when the entry was already purged as
					// stale by `readSynchronizedLock` (because the agent
					// exceeded `stale_after_minutes` between the
					// snapshot read and the release), the engine
					// reports `removed: 0, released: false`. The lock
					// IS gone from disk (the purge removed it), so
					// emit anyway — the orphan truly had a lock, and
					// the lock truly is freed.
					const stillHeld =
						body.ok === true && (body.removed ?? 0) > 0;
					if (stillHeld) {
						releasedLock = true;
					} else {
						try {
							const rawAfter = await readLockText(lockPath);
							if (rawAfter === null) {
								// Lock file unreadable → assume the entry
								// is gone (purge happened and rewrite
								// failed). Treat as released.
								releasedLock = true;
								continue;
							}
							const parsedAfter = JSON.parse(rawAfter) as {
								in_flight?: unknown;
							};
							const inflightAfter = Array.isArray(
								parsedAfter?.in_flight,
							)
								? (parsedAfter.in_flight as unknown[])
								: [];
							const stillInFlight = inflightAfter.some(
								(entry) =>
									(entry as { task_id?: string })?.task_id ===
									orphan.taskId,
							);
							releasedLock = !stillInFlight;
						} catch {
							// Lock file unreadable → assume the entry
							// is gone (purge happened and rewrite
							// failed). Treat as released.
							releasedLock = true;
						}
					}
				}

				if (releasedLock && options?.queueEmitter) {
					const eventTaskId = `zombie-gc-event-${orphan.taskId}`;
					await options.queueEmitter(eventTaskId, 4);
					releasedLockCount += 1;
				}
			}
		}
		if (mutated) {
			await store.write(registry);
		}
		// R-2026-08-31: stash the count so callers can observe it.
		(report as { releasedLockCount?: number }).releasedLockCount =
			releasedLockCount;
	}

	return report;
}
