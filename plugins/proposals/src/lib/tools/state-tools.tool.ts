import { existsSync, readFileSync } from 'node:fs';

import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import { toolJson } from '@cartago-git/mcp-core/public';

import { runAgentLockEngine } from '../locks/agent-lock-engine';

/** In-flight claim count straight from the lock file (0 if missing/corrupt). */
const rawInFlightCount = (lockPath: string): number => {
	if (!existsSync(lockPath)) return 0;
	try {
		const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as {
			in_flight?: unknown[];
		};
		return Array.isArray(parsed.in_flight) ? parsed.in_flight.length : 0;
	} catch {
		return 0;
	}
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
}

interface IStateDiagnosis {
	readonly locks: { readonly active: number };
	readonly queue:
		| {
				readonly queueLength: number;
				readonly queuedCount: number;
				readonly waiterOrphans: number;
				readonly oldestAgeMinutes: number;
				readonly threshold: string;
		  }
		| null;
	readonly registry: {
		readonly orphans: number;
		readonly threshold: string;
	};
	readonly healthy: boolean;
}

/**
 * Read-only health snapshot of the swarm state: how many write lanes are
 * held, queue backpressure (waiter orphans / threshold), and orphaned
 * agent assignments. Pure over the injected paths; reuses the same
 * (tested) engines the repair tool calls in execute mode.
 */
const diagnose = async (options: IStateToolOptions): Promise<IStateDiagnosis> => {
	const lockStatusRaw = await runAgentLockEngine(
		{ action: 'status' },
		{ lockPath: options.lockPathAbs }
	);
	const lockStatus = JSON.parse(lockStatusRaw.content[0]?.text ?? '{}') as {
		active_write_lanes?: number;
	};

	let queue: IStateDiagnosis['queue'] = null;
	if (existsSync(options.queuePathAbs)) {
		const loaded = await parseQueue(
			options.queuePathAbs,
			options.closedTasksPathAbs
		);
		const lockSnapshot = await loadLockSnapshot(
			options.lockPathAbs,
			options.closedTasksPathAbs
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
		{ dryRun: true }
	);

	const healthy =
		(queue?.threshold ?? 'green') !== 'red' &&
		zombies.orphans.length === 0 &&
		(queue?.waiterOrphans ?? 0) === 0;

	return {
		locks: { active: lockStatus.active_write_lanes ?? 0 },
		queue,
		registry: {
			orphans: zombies.orphans.length,
			threshold: zombies.threshold,
		},
		healthy,
	};
};

/** `<prefix>_state_health` — read-only swarm state diagnosis. */
export const buildStateHealthRegistration = (
	options: IStateToolOptions
): IToolRegistration => ({
	id: 'state_health',
	summary:
		'Read-only swarm health: active locks, queue backpressure (waiterOrphans/threshold) and orphan assignments.',
	tags: ['coordination', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_state_health`,
			{
				description:
					'Diagnose swarm state without changing anything: active write lanes, queue backpressure (waiterOrphans + threshold) and orphaned agent assignments. Returns { locks, queue, registry, healthy }. Run state_repair to heal.',
			},
			async () => toolJson(await diagnose(options))
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
	options: IStateToolOptions
): IToolRegistration => ({
	id: 'state_repair',
	summary:
		'Heal stale swarm state: GC stale locks, expire due queue entries, force-release orphan assignments. dry-run by default.',
	tags: ['coordination'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_state_repair`,
			{
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

				// 1) GC stale write locks (engine drops entries past TTL). Count
				// honestly via the on-disk file before/after, because the engine
				// strips stale entries in-memory before its own `dropped` tally.
				const lockedBefore = rawInFlightCount(options.lockPathAbs);
				await runAgentLockEngine(
					{ action: 'gc' },
					{ lockPath: options.lockPathAbs }
				);
				const staleLocksCleaned =
					lockedBefore - rawInFlightCount(options.lockPathAbs);

				// 2) Expire due queue entries.
				let expiredCount = 0;
				if (existsSync(options.queuePathAbs)) {
					const loaded = await parseQueue(
						options.queuePathAbs,
						options.closedTasksPathAbs
					);
					const swept = await expireSweep(
						loaded,
						new Date().toISOString(),
						options.queuePathAbs
					);
					expiredCount = swept.expiredCount;
				}

				// 3) Force-release orphan agent assignments.
				const zombies = await gcZombies(
					options.registryPathAbs,
					options.lockPathAbs,
					options.queuePathAbs,
					{ dryRun: false }
				);

				return toolJson({
					mode: 'execute',
					repaired: {
						staleLocks: staleLocksCleaned,
						expiredQueueEntries: expiredCount,
						orphanAssignments: zombies.orphans.length,
					},
					diagnosis: await diagnose(options),
				});
			}
		);
	},
});
