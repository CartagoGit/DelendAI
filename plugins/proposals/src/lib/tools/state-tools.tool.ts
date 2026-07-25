import { stat } from 'node:fs/promises';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson, withFileMutex } from '@mcp-vertex/core/public';

import {
	getAgentLockSessionBalance,
	runAgentLockEngine,
} from '../locks/agent-lock-engine';
import { readJsonOrNull } from '../proposals/index-reader';
import { getPeerReviewBypassCount } from '../shared/peer-review-bypass-log';

/** Async existence check (H2): never blocks the event loop. */
const fileExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

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

export interface IStateToolOptions {
	readonly namespacePrefix: string;
	/** Absolute paths to the swarm state files. */
	readonly lockPathAbs: string;
	readonly queuePathAbs: string;
	readonly closedTasksPathAbs: string;
	readonly registryPathAbs: string;
	/** Absolute workspace root — anchors `waitFor.file` resolution. */
	readonly workspaceRoot: string;
	/**
	 * a00069 S6: TTL (minutes) for non-adopted registry assignments before
	 * `state_repair` purges them. Default is 7 days (see
	 * `DEFAULT_ORPHAN_TTL_MINUTES` in zombie-reconcile).
	 */
	readonly orphanTtlMinutes?: number;
}

/** a00069 S8: alert when session claims − releases exceeds this. */
const CLAIM_RELEASE_IMBALANCE_THRESHOLD = 5;

interface IStateDiagnosis {
	readonly locks: {
		readonly active: number;
		/** a00069 S8: process-local claim−release imbalance (telemetry). */
		readonly sessionImbalance: number;
		readonly sessionClaims: number;
		readonly sessionReleases: number;
	};
	/** a00069 S11: peer-review bypasses (force/skipPeerReview) this session. */
	readonly peerReviewBypasses: number;
	readonly queue: {
		readonly queueLength: number;
		readonly queuedCount: number;
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

const STATE_DIAGNOSIS_SCHEMA = z.object({
	locks: z.object({
		active: z.number(),
		sessionClaims: z.number(),
		sessionReleases: z.number(),
		sessionImbalance: z.number(),
	}),
	/** a00069 S11: force/skipPeerReview peer-review bypasses this session. */
	peerReviewBypasses: z.number(),
	queue: z
		.object({
			queueLength: z.number(),
			queuedCount: z.number(),
			waiterOrphans: z.number(),
			oldestAgeMinutes: z.number(),
			threshold: z.string(),
		})
		.nullable(),
	registry: z.object({
		orphans: z.number(),
		threshold: z.string(),
	}),
	healthy: z.boolean(),
});

const STATE_REPAIR_OUTPUT_SCHEMA = z.object({
	mode: z.enum(['dry-run', 'execute']),
	diagnosis: STATE_DIAGNOSIS_SCHEMA,
	wouldRepair: z
		.object({
			staleLocks: z.number(),
			dueQueueEntries: z.number(),
			orphanAssignments: z.number(),
		})
		.optional(),
	repaired: z
		.object({
			staleLocks: z.number(),
			expiredQueueEntries: z.number(),
			orphanAssignments: z.number(),
		})
		.optional(),
	nextAction: z.string().optional(),
});

/**
 * Read-only health snapshot of the swarm state: how many write lanes are
 * held, queue backpressure (waiter orphans / threshold), and orphaned
 * agent assignments. Pure over the injected paths; reuses the same
 * (tested) engines the repair tool calls in execute mode.
 */
const diagnose = async (
	options: IStateToolOptions,
): Promise<IStateDiagnosis> => {
	const lockStatusRaw = await runAgentLockEngine(
		{ action: 'status' },
		{ lockPath: options.lockPathAbs },
	);
	const lockStatus = JSON.parse(lockStatusRaw.content[0]?.text ?? '{}') as {
		active_write_lanes?: number;
	};

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

	// a00069 S8: claim−release session imbalance (historical 29/19) and live
	// orphan locks both fail the health gate.
	const balance = getAgentLockSessionBalance();
	const claimReleaseImbalanceAlert =
		balance.imbalance > CLAIM_RELEASE_IMBALANCE_THRESHOLD;
	const activeLocks = lockStatus.active_write_lanes ?? 0;

	const healthy =
		(queue?.threshold ?? 'green') !== 'red' &&
		zombies.orphans.length === 0 &&
		(queue?.waiterOrphans ?? 0) === 0 &&
		!claimReleaseImbalanceAlert;

	return {
		locks: {
			active: activeLocks,
			sessionClaims: balance.claims,
			sessionReleases: balance.releases,
			sessionImbalance: balance.imbalance,
		},
		peerReviewBypasses: getPeerReviewBypassCount(),
		queue,
		registry: {
			orphans: zombies.orphans.length,
			threshold: zombies.threshold,
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
				before.locks.active === 0
			) {
				return;
			}
			const repaired = await runStateRepair(options);
			console.info(
				JSON.stringify({
					event: 'state-repair-auto',
					staleLocks: repaired.staleLocks,
					expiredQueueEntries: repaired.expiredQueueEntries,
					orphanAssignments: repaired.orphanAssignments,
					healthy: repaired.diagnosis.healthy,
				}),
			);
		} catch (err) {
			console.info(
				JSON.stringify({
					event: 'state-repair-auto',
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
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
		'Read-only swarm health: active locks, queue backpressure (waiterOrphans/threshold) and orphan assignments.',
	tags: ['coordination', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_state_health`,
			{
				outputSchema: STATE_DIAGNOSIS_SCHEMA,
				description:
					'Diagnose swarm state without changing anything: active write lanes, queue backpressure (waiterOrphans + threshold) and orphaned agent assignments. Returns { locks, queue, registry, healthy }. Run state_repair to heal.',
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
				inputSchema: z.object({
					mode: z.enum(['dry-run', 'execute']).optional(),
				}),
			},
			async (args: { mode?: 'dry-run' | 'execute' | undefined }) => {
				const before = await diagnose(options);
				if (args.mode !== 'execute') {
					return toolJson({
						mode: 'dry-run',
						diagnosis: before,
						wouldRepair: {
							staleLocks: before.locks.active,
							dueQueueEntries: before.queue?.queuedCount ?? 0,
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
