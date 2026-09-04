import { access } from 'node:fs/promises';

import z from 'zod';

import type {
	IPluginLogsHelper,
	IToolRegistration,
} from '@delendai/core/public';
import { toolJson, withFileMutex } from '@delendai/core/public';

import type { ILockEntry, ILockFile } from '../locks/agent-lock-engine';
import {
	detectContention,
	type ILivelockPair,
} from '../locks/contention-detector';
import { deriveFileLockTablePath } from '../locks/file-lock-table';
import { runAgentLockEngine } from '../locks/agent-lock-engine';
import { readSessionBalance } from '../locks/agent-lock-session-store';
import { readJsonOrNull } from '../proposals/index-reader';
import { getPeerReviewBypassCount } from '../shared/peer-review-bypass-log';
import { DEFAULT_STALE_AFTER_MINUTES } from '../shared/branch-tool-helpers';
import { purgeStaleLocks } from '../shared/purge-stale-locks';
import {
	optionalString,
	optionalUnknown,
} from '../shared/tool-schema-shortcuts';
import { readAutoTransitionRepairs } from '../services/auto-transition';

const countDueQueueEntries = (
	entries: readonly { status: string; expiresAt?: string }[],
	now = Date.now(),
): number =>
	entries.filter(
		(entry) =>
			entry.status === 'queued' &&
			typeof entry.expiresAt === 'string' &&
			Date.parse(entry.expiresAt) < now,
	).length;

/** In-flight claim count straight from the lock file (0 if missing/corrupt). */
const rawInFlightCount = async (lockPath: string): Promise<number> => {
	const parsed = await readJsonOrNull<{ in_flight?: unknown[] }>(lockPath);
	return Array.isArray(parsed?.in_flight) ? parsed.in_flight.length : 0;
};
import {
	expireSweep,
	loadLockSnapshot,
	parseQueue,
	reportBackpressure,
} from '../agents/persistent-task-queue';
import { gcZombies } from '../agents/zombie-reconcile';
import { fileExists } from '../locks/lock-paths';
import { emptyLock } from '../locks/lock-store';

export interface IStateToolOptions {
	readonly namespacePrefix: string;
	/** Absolute paths to the swarm state files. */
	readonly lockPathAbs: string;
	readonly queuePathAbs: string;
	readonly closedTasksPathAbs: string;
	readonly registryPathAbs: string;
	readonly fileLockTablePathAbs?: string;
	/** Absolute workspace root — anchors `waitFor.file` resolution. */
	readonly workspaceRoot: string;
	/**
	 * a00069 S6: TTL (minutes) for non-adopted registry assignments before
	 * `state_repair` purges them. Default is 7 days (see
	 * `DEFAULT_ORPHAN_TTL_MINUTES` in zombie-reconcile).
	 */
	readonly orphanTtlMinutes?: number;
	/**
	 * x00156 S2 — structured-log helper from the `logs` plugin (f00153
	 * S4's `ctx.logs`). Conditional on that plugin being loaded; when
	 * absent, the auto-repair events below are simply not emitted
	 * (they were previously written via `console.info`, which bypassed
	 * the structured incident stream entirely).
	 */
	readonly logs?: IPluginLogsHelper | undefined;
}

/** a00069 S8: alert when session claims − releases exceeds this. */
const CLAIM_RELEASE_IMBALANCE_THRESHOLD = 5;
const HEARTBEAT_STALL_MS = 30_000;

interface IStateDiagnosis {
	readonly locks: {
		readonly active: number;
		readonly stale: number;
		readonly staleTaskIds: readonly string[];
		readonly lastStaleSeen: string | null;
		readonly livelocks: number;
		readonly livelockPairs: readonly ILivelockPair[];
		readonly crossProposal: readonly {
			readonly id: string;
			readonly count: number;
			readonly taskIds: readonly string[];
		}[];
		readonly sessionBalance: {
			readonly claims: number;
			readonly releases: number;
			readonly imbalance: number;
		};
		/** a00069 S8: persisted claim−release imbalance (telemetry). */
		readonly sessionImbalance: number;
		readonly sessionClaims: number;
		readonly sessionReleases: number;
	};
	/**
	 * a00072 S1.a (F148/F151): stale in-flight locks the engine would
	 * drop if `state_repair` ran. Counted by running `removeStale`
	 * against the lock file in-memory (no write) so the smoke
	 * detector always reports what would be repaired.
	 */
	readonly stale: {
		readonly count: number;
		readonly taskIds: readonly string[];
		readonly lastStaleSeen: string | null;
	};
	/** Locks whose first heartbeat was never refreshed after the diagnose window. */
	readonly heartbeatStalls: {
		readonly count: number;
		readonly taskIds: readonly string[];
	};
	/** a00069 S11: peer-review bypasses (force/skipPeerReview) this session. */
	readonly peerReviewBypasses: number;
	readonly autoTransitionRepairs: {
		readonly count: number;
		readonly entries: readonly {
			readonly proposalId: string;
			readonly path: string;
			readonly reason: string;
			readonly ts: string;
		}[];
	};
	readonly queue: {
		readonly queueLength: number;
		readonly queuedCount: number;
		readonly dueQueueEntries: number;
		readonly waiterOrphans: number;
		readonly oldestAgeMinutes: number;
		readonly threshold: string;
	} | null;
	readonly registry: {
		readonly orphans: number;
		readonly threshold: string;
	};
	readonly healthy: boolean;
}

const STATE_DIAGNOSIS_SCHEMA = z
	.object({
		locks: z
			.object({
				active: z.number(),
				stale: z.number(),
				livelocks: z.number(),
				sessionBalance: z.object({
					claims: z.number(),
					releases: z.number(),
					imbalance: z.number(),
				}),
				sessionClaims: z.number(),
				sessionReleases: z.number(),
				sessionImbalance: z.number(),
			})
			.passthrough(),
		/**
		 * a00072 S1.a: stale locks the smoke detector sees right now.
		 * When `stale.count > 0` the host should suggest `state_repair
		 * { mode: "execute" }` (or the explicit `agent_lock_release_orphan`
		 * tool for a targeted release).
		 */
		stale: z
			.object({
				count: z.number(),
			})
			.passthrough(),
		heartbeatStalls: z
			.object({
				count: z.number(),
			})
			.passthrough(),
		/** a00069 S11: force/skipPeerReview peer-review bypasses this session. */
		peerReviewBypasses: z.number(),
		autoTransitionRepairs: z
			.object({
				count: z.number(),
			})
			.passthrough(),
		queue: z
			.object({
				queueLength: z.number(),
				queuedCount: z.number(),
				waiterOrphans: z.number(),
				oldestAgeMinutes: z.number(),
				threshold: z.string(),
			})
			.passthrough()
			.nullable(),
		registry: z
			.object({
				orphans: z.number(),
				threshold: z.string(),
			})
			.passthrough(),
		healthy: z.boolean(),
	})
	.passthrough();

export const STATE_REPAIR_OUTPUT_SCHEMA = z
	.object({
		mode: z.enum(['dry-run', 'execute']),
		diagnosis: z.unknown(),
		wouldRepair: optionalUnknown(),
		repaired: optionalUnknown(),
		nextAction: optionalString(),
	})
	.passthrough();

export const STATE_REPAIR_INPUT_SCHEMA = z.object({
	mode: z.enum(['dry-run', 'execute']).optional(),
});

const readLockSnapshot = async (lockPath: string): Promise<ILockFile> => {
	const parsed = await readJsonOrNull<Partial<ILockFile>>(lockPath);
	if (parsed === null) {
		return emptyLock();
	}
	return {
		version: parsed.version ?? 1,
		stale_after_minutes:
			parsed.stale_after_minutes ?? DEFAULT_STALE_AFTER_MINUTES,
		in_flight: Array.isArray(parsed.in_flight) ? parsed.in_flight : [],
	};
};

const taskProposalId = (taskId: string): string => {
	const sliceIndex = taskId.indexOf('-S');
	return sliceIndex === -1 ? taskId : taskId.slice(0, sliceIndex);
};

const findStaleEntries = (lock: ILockFile): readonly ILockEntry[] => {
	const thresholdMs = lock.stale_after_minutes * 60_000;
	return lock.in_flight.filter((entry) => {
		const lastSeenMs = new Date(entry.last_seen).getTime();
		if (Number.isNaN(lastSeenMs)) {
			return true;
		}
		return Date.now() - lastSeenMs > thresholdMs;
	});
};

const findLastStaleSeen = (entries: readonly ILockEntry[]): string | null => {
	let latest: number | null = null;
	for (const entry of entries) {
		const lastSeenMs = new Date(entry.last_seen).getTime();
		if (Number.isNaN(lastSeenMs)) {
			continue;
		}
		if (latest === null || lastSeenMs > latest) {
			latest = lastSeenMs;
		}
	}
	return latest === null ? null : new Date(latest).toISOString();
};

const findHeartbeatStalls = (
	entries: readonly ILockEntry[],
	nowMs = Date.now(),
): readonly ILockEntry[] =>
	entries.filter((entry) => {
		if (entry.started_at !== entry.last_seen) return false;
		const lastSeenMs = Date.parse(entry.last_seen);
		return (
			!Number.isNaN(lastSeenMs) && nowMs - lastSeenMs > HEARTBEAT_STALL_MS
		);
	});

const summarizeCrossProposal = (
	entries: readonly ILockEntry[],
): IStateDiagnosis['locks']['crossProposal'] => {
	const grouped = new Map<string, { count: number; taskIds: string[] }>();
	for (const entry of entries) {
		const id = taskProposalId(entry.task_id);
		const current = grouped.get(id) ?? { count: 0, taskIds: [] };
		current.count += 1;
		current.taskIds.push(entry.task_id);
		grouped.set(id, current);
	}
	return [...grouped.entries()]
		.map(([id, value]) => ({
			id,
			count: value.count,
			taskIds: value.taskIds,
		}))
		.sort((a, b) => a.id.localeCompare(b.id));
};

/**
 * Read-only health snapshot of the swarm state: how many write lanes are
 * held, queue backpressure (waiter orphans / threshold), and orphaned
 * agent assignments. Pure over the injected paths; reuses the same
 * (tested) engines the repair tool calls in execute mode.
 */
const diagnose = async (
	options: IStateToolOptions,
): Promise<IStateDiagnosis> => {
	const rawLock = await readLockSnapshot(options.lockPathAbs);
	const staleEntries = findStaleEntries(rawLock);
	const staleTaskIds = staleEntries.map((entry) => entry.task_id);
	await purgeStaleLocks({ lockPath: options.lockPathAbs });
	const cleanedLock = await readLockSnapshot(options.lockPathAbs);
	const lockStatusRaw = await runAgentLockEngine(
		{ action: 'status' },
		{ lockPath: options.lockPathAbs },
	);
	const lockStatus = JSON.parse(lockStatusRaw.content[0]?.text ?? '{}') as {
		active_write_lanes?: number;
	};
	const stale = {
		count: staleTaskIds.length,
		taskIds: staleTaskIds,
		lastStaleSeen: findLastStaleSeen(staleEntries),
	};
	const heartbeatStalls = findHeartbeatStalls(rawLock.in_flight);
	const livelockState = await detectContention({
		lockPath: options.lockPathAbs,
		fileLockTablePath:
			options.fileLockTablePathAbs ??
			deriveFileLockTablePath(options.lockPathAbs),
	});

	let queue: IStateDiagnosis['queue'] = null;
	if (await fileExists(options.queuePathAbs)) {
		const loaded = await parseQueue(
			options.queuePathAbs,
			options.closedTasksPathAbs,
			options.workspaceRoot,
		);
		const lockSnapshot = await loadLockSnapshot(
			options.lockPathAbs,
			options.closedTasksPathAbs,
		);
		const report = reportBackpressure(loaded, lockSnapshot);
		queue = {
			queueLength: report.queueLength,
			queuedCount: report.queuedCount,
			dueQueueEntries: countDueQueueEntries(loaded.entries),
			waiterOrphans: report.waiterOrphans,
			oldestAgeMinutes: report.oldestAgeMinutes,
			threshold: report.threshold,
		};
	}

	const zombies = await gcZombies(
		options.registryPathAbs,
		options.lockPathAbs,
		options.queuePathAbs,
		{
			dryRun: true,
			...(options.orphanTtlMinutes !== undefined
				? { orphanTtlMinutes: options.orphanTtlMinutes }
				: {}),
		},
	);

	const autoTransitionRepairs = await readAutoTransitionRepairs(
		options.workspaceRoot,
	);

	// a00069 S8 / x00153 S1: persisted claim−release imbalance and live
	// orphan locks both fail the health gate.
	const balance = await readSessionBalance(options.workspaceRoot);
	const claimReleaseImbalanceAlert =
		balance.imbalance > CLAIM_RELEASE_IMBALANCE_THRESHOLD;
	const activeLocks =
		lockStatus.active_write_lanes ?? cleanedLock.in_flight.length;

	const healthy =
		(queue?.threshold ?? 'green') !== 'red' &&
		zombies.orphans.length === 0 &&
		(queue?.waiterOrphans ?? 0) === 0 &&
		livelockState.livelocks.length === 0 &&
		!claimReleaseImbalanceAlert &&
		stale.count === 0 &&
		heartbeatStalls.length === 0 &&
		autoTransitionRepairs.length === 0;

	return {
		locks: {
			active: activeLocks,
			stale: stale.count,
			staleTaskIds: stale.taskIds,
			lastStaleSeen: stale.lastStaleSeen,
			livelocks: livelockState.livelocks.length,
			livelockPairs: livelockState.livelocks,
			crossProposal: summarizeCrossProposal(cleanedLock.in_flight),
			sessionBalance: balance,
			sessionClaims: balance.claims,
			sessionReleases: balance.releases,
			sessionImbalance: balance.imbalance,
		},
		peerReviewBypasses: getPeerReviewBypassCount(),
		autoTransitionRepairs: {
			count: autoTransitionRepairs.length,
			entries: autoTransitionRepairs,
		},
		queue,
		registry: {
			orphans: zombies.orphans.length,
			threshold: zombies.threshold,
		},
		stale,
		heartbeatStalls: {
			count: heartbeatStalls.length,
			taskIds: heartbeatStalls.map((entry) => entry.task_id),
		},
		healthy,
	};
};

/**
 * Shared execute-path for state_repair (manual tool + a00069 S10 auto boot).
 * GC stale locks, expire due queue entries, force-release orphan assignments.
 */
export const runStateRepair = async (
	options: IStateToolOptions,
): Promise<{
	readonly staleLocks: number;
	readonly expiredQueueEntries: number;
	readonly orphanAssignments: number;
	readonly diagnosis: IStateDiagnosis;
}> => {
	const lockedBefore = await rawInFlightCount(options.lockPathAbs);
	await runAgentLockEngine(
		{ action: 'gc' },
		{ lockPath: options.lockPathAbs },
	);
	const staleLocksCleaned =
		lockedBefore - (await rawInFlightCount(options.lockPathAbs));

	let expiredCount = 0;
	if (await fileExists(options.queuePathAbs)) {
		expiredCount = await withFileMutex(options.queuePathAbs, async () => {
			const loaded = await parseQueue(
				options.queuePathAbs,
				options.closedTasksPathAbs,
				options.workspaceRoot,
			);
			const swept = await expireSweep(
				loaded,
				new Date().toISOString(),
				options.queuePathAbs,
			);
			return swept.expiredCount;
		});
	}

	const zombies = await gcZombies(
		options.registryPathAbs,
		options.lockPathAbs,
		options.queuePathAbs,
		{
			dryRun: false,
			...(options.orphanTtlMinutes !== undefined
				? { orphanTtlMinutes: options.orphanTtlMinutes }
				: {}),
		},
	);

	return {
		staleLocks: staleLocksCleaned,
		expiredQueueEntries: expiredCount,
		orphanAssignments: zombies.orphans.length,
		diagnosis: await diagnose(options),
	};
};

/**
 * a00069 S10: one-shot auto purge at plugin boot. Idempotent; logs a compact
 * `state-repair-auto` line. Failures are swallowed so a corrupt cache never
 * blocks tool registration.
 */
export const runAutoStateRepairOnBoot = (
	options: IStateToolOptions,
): Promise<void> => {
	const run = async (): Promise<void> => {
		try {
			const before = await diagnose(options);
			if (
				before.registry.orphans === 0 &&
				(before.queue?.waiterOrphans ?? 0) === 0 &&
				before.stale.count === 0 &&
				before.locks.active === 0
			) {
				return;
			}
			const repaired = await runStateRepair(options);
			void options.logs?.log({
				severity: 'warning',
				incidentType: 'state-repair-auto',
				message: `state-repair-auto: staleLocks=${repaired.staleLocks} expired=${repaired.expiredQueueEntries} orphans=${repaired.orphanAssignments} healthy=${repaired.diagnosis.healthy}`,
				context: {
					staleLocks: repaired.staleLocks,
					expiredQueueEntries: repaired.expiredQueueEntries,
					orphanAssignments: repaired.orphanAssignments,
					healthy: repaired.diagnosis.healthy,
				},
			});
		} catch (err) {
			void options.logs?.log({
				severity: 'error',
				incidentType: 'state-repair-auto',
				message: `state-repair-auto failed: ${err instanceof Error ? err.message : String(err)}`,
				context: {
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				},
			});
		}
	};
	const pending = run();
	void pending;
	return pending;
};

/** `<prefix>_state_health` — read-only swarm state diagnosis. */
export const buildStateHealthRegistration = (
	options: IStateToolOptions,
): IToolRegistration => ({
	id: 'state_health',
	summary:
		'Read-only swarm health: active locks, stale locks, livelocks, queue backpressure (waiterOrphans/threshold) and orphan assignments.',
	tags: ['coordination', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_state_health`,
			{
				outputSchema: STATE_DIAGNOSIS_SCHEMA,
				description:
					'Diagnose swarm state without changing anything: active write lanes, stale locks, livelocks, queue backpressure (waiterOrphans + threshold) and orphaned agent assignments. Returns { locks, stale, queue, registry, healthy }. Run state_repair to heal.',
			},
			async () => toolJson(await diagnose(options)),
		);
	},
});

/**
 * `<prefix>_state_repair` — heal stale swarm state. `mode: "dry-run"`
 * (default) only reports what WOULD be removed; `mode: "execute"`
 * actually GC's stale locks, expires due queue entries and force-releases
 * orphan assignments (each via the engine's own atomic/mutex write).
 */
export const buildStateRepairRegistration = (
	options: IStateToolOptions,
): IToolRegistration => ({
	id: 'state_repair',
	effects: ['write'],
	summary:
		'Heal stale swarm state: GC stale locks, expire due queue entries, force-release orphan assignments. dry-run by default.',
	tags: ['coordination'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_state_repair`,
			{
				outputSchema: STATE_REPAIR_OUTPUT_SCHEMA,
				description:
					'Auto-heal stale swarm state. mode:"dry-run" (default) reports what would be removed; mode:"execute" GCs stale locks, expires due queue entries and force-releases orphan assignments (atomic, mutex-guarded). Returns the diagnosis plus what was (or would be) removed.',
				inputSchema: STATE_REPAIR_INPUT_SCHEMA,
			},
			async (args: { mode?: 'dry-run' | 'execute' | undefined }) => {
				const before = await diagnose(options);
				if (args.mode !== 'execute') {
					return toolJson({
						mode: 'dry-run',
						diagnosis: before,
						wouldRepair: {
							staleLocks: before.stale.count,
							dueQueueEntries: before.queue?.dueQueueEntries ?? 0,
							orphanAssignments: before.registry.orphans,
						},
						nextAction:
							'Re-run with mode:"execute" to apply the repair.',
					});
				}

				const repaired = await runStateRepair(options);
				return toolJson({
					mode: 'execute',
					repaired: {
						staleLocks: repaired.staleLocks,
						expiredQueueEntries: repaired.expiredQueueEntries,
						orphanAssignments: repaired.orphanAssignments,
					},
					diagnosis: repaired.diagnosis,
				});
			},
		);
	},
});
