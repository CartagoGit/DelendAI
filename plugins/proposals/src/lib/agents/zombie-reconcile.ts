import { readFileSync, existsSync } from 'node:fs';
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
}

export type IZombieThreshold = 'green' | 'yellow' | 'red';

export type IZombieReason =
	| 'cooldown_null' // cooldown_until: null + adopted: true
	| 'stale_no_lock' // age > stale_after_minutes, no lock entry
	| 'stale_with_orphaned_lock'; // age > stale_after_minutes, lock entry también rancia

export type IZombieRecommendedAction =
	| 'force_release' // eliminar del registry + emitir evento
	| 'extend_cooldown' // fijar cooldown_until = now + 7d (solo si hay señales de actividad reciente)
	| 'escalate'; // lock bloqueado activamente o condición ambigua

export type IQueueEventEmitter = (
	taskId: string,
	priority: number
) => Promise<void>;

const loadLockSnapshotLocal = (
	lockPath: string
): {
	in_flight: Array<{ task_id: string; agent: string; claimed_at: string }>;
} => {
	if (!existsSync(lockPath)) {
		return { in_flight: [] };
	}
	try {
		const raw = readFileSync(lockPath, 'utf8');
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
	staleAfterMinutes = 10
): IZombieReconcileReport {
	const checkTime = now || new Date();
	const checkMs = checkTime.getTime();
	const orphans: IZombieOrphanEntry[] = [];

	for (const a of registry.assignments) {
		if (a.adopted !== true) {
			continue;
		}

		const lastSeenTime = Date.parse(a.last_seen);
		if (Number.isNaN(lastSeenTime)) {
			continue;
		}

		const ageMinutes = (checkMs - lastSeenTime) / 60_000;
		if (ageMinutes <= staleAfterMinutes) {
			continue;
		}

		const lockEntry = lockSnapshot.in_flight.find(
			(le) => le.task_id === a.task_id
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
			: `${orphans.length} zombie(s) detected. Recommended action: run <prefix>_agent_names reconcile to clean up.`;

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
	queuePath: string,
	options?: {
		dryRun?: boolean | undefined;
		staleAfterMinutes?: number | undefined;
		now?: Date | undefined;
		queueEmitter?: IQueueEventEmitter | undefined;
	}
): Promise<IZombieReconcileReport> {
	const store = createAgentRegistryStore(registryPath);
	const registry = await store.read();
	const lockSnapshot = loadLockSnapshotLocal(lockPath);

	const now = options?.now || new Date();
	const staleAfterMinutes = options?.staleAfterMinutes ?? 10;

	const report = classifyZombies(
		registry,
		lockSnapshot,
		now,
		staleAfterMinutes
	);

	if (options?.dryRun !== true && report.orphans.length > 0) {
		let mutated = false;
		for (const orphan of report.orphans) {
			if (orphan.recommendedAction === 'force_release') {
				const before = registry.assignments.length;
				registry.assignments = registry.assignments.filter(
					(a) => a.task_id !== orphan.taskId
				);
				if (registry.assignments.length < before) {
					mutated = true;
				}

				if (options?.queueEmitter) {
					const eventTaskId = `zombie-gc-event-${orphan.taskId}`;
					await options.queueEmitter(eventTaskId, 4);
				}
			}
		}
		if (mutated) {
			await store.write(registry);
		}
	}

	return report;
}
