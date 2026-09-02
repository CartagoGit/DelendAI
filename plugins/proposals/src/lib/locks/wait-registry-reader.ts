import { basename, dirname, join } from 'node:path';

import { SafeWorkspaceReader } from '@mcp-vertex/core/public';
import { findWaitForCycles } from '@mcp-vertex/core/lib/shared/wait-for-graph';

import type { IWaitForEdge } from '@mcp-vertex/core/lib/contracts/interfaces/wait-for-graph.interface';
import type { ILockEntry } from './agent-lock-engine';
import type {
	IWaitDiagnostics,
	IWaitReport,
} from '../contracts/interfaces/wait-diagnostics.interface';

/**
 * Read the wait registry that `await_lock` publishes, so lock health can
 * report what a snapshot of holders alone can never show: who is blocked
 * on whom, and whether anyone is blocked in a circle.
 *
 * `agents_lock_diagnose` could already name zombies, orphaned temp files
 * and log gaps — every way a lock goes wrong *by itself*. It could say
 * nothing about the failure that only exists between agents. An operator
 * looking at a stalled swarm saw a lock file full of healthy,
 * heartbeating claims and no explanation at all.
 *
 * A file read at a sibling path, not a dependency: `notification` writes
 * it, `proposals` reads it, neither imports the other, and a workspace
 * where nobody has ever waited simply has no file and reports nothing.
 */

interface IWaitRow {
	readonly waiter?: string;
	readonly waitingOnTaskId?: string;
	readonly since?: string;
}

/** Sibling of the lock file, matching what `await_lock` writes. */
export const deriveWaitRegistryPath = (lockPathAbs: string): string =>
	join(dirname(lockPathAbs), `${basename(lockPathAbs, '.json')}.waits.json`);

export const readWaitDiagnostics = async (input: {
	readonly lockPathAbs: string;
	readonly inFlight: readonly ILockEntry[];
	readonly nowMs?: number;
}): Promise<IWaitDiagnostics> => {
	const nowMs = input.nowMs ?? Date.now();
	const path = deriveWaitRegistryPath(input.lockPathAbs);
	let rows: readonly IWaitRow[];
	try {
		const raw = (
			await new SafeWorkspaceReader(dirname(path)).readText(
				basename(path),
			)
		).content;
		const parsed = JSON.parse(raw) as { waits?: readonly IWaitRow[] };
		rows = Array.isArray(parsed.waits) ? parsed.waits : [];
	} catch {
		// No registry, or a torn one. A diagnostic must never fail on the
		// absence of the thing it is reporting about.
		return { waits: [], deadlocks: [] };
	}
	const holderOf = new Map(
		input.inFlight.map((entry) => [entry.task_id, entry.agent]),
	);
	const waits: IWaitReport[] = [];
	const edges: IWaitForEdge[] = [];
	for (const row of rows) {
		if (
			typeof row.waiter !== 'string' ||
			typeof row.waitingOnTaskId !== 'string'
		) {
			continue;
		}
		const holder = holderOf.get(row.waitingOnTaskId) ?? null;
		const sinceMs = Date.parse(row.since ?? '');
		waits.push({
			waiter: row.waiter,
			waitingOnTaskId: row.waitingOnTaskId,
			holder,
			waitingForSeconds: Number.isFinite(sinceMs)
				? Math.max(0, Math.floor((nowMs - sinceMs) / 1000))
				: null,
		});
		if (holder !== null) edges.push({ waiter: row.waiter, holder });
	}
	return {
		waits,
		deadlocks: findWaitForCycles(edges).map((cycle) => cycle.agents),
	};
};
