/**
 * agent-lock-positive-ownership.ts — read the proposals agent-lock store
 * and return the files an agent+task pair currently owns.
 *
 * This is the positive-ownership side of the foreign-lock filter
 * (`foreign-lock-filter.ts`). The existing filter says "withhold any
 * path claimed by someone else"; this reader says "give me the paths
 * I (the agent) am allowed to commit".
 *
 * Fail-closed: if the lock file cannot be read, the resolver returns
 * `[]` and the engine logs a WARN. The slice then has no ownership
 * intersection and only declared canonical paths make it through
 * resolveCommitScope (which is the safe default). That's the opposite
 * of the foreign-lock filter — the foreign-lock filter is fail-OPEN
 * because a stale read must not stop a commit; positive ownership is
 * fail-CLOSED because guessing wrong would commit paths the agent
 * does not actually own.
 */

import { basename, dirname, join } from 'node:path';

import { SafeWorkspaceReader } from '@mcp-vertex/core/public';
import { isLockEntryExpired } from '@mcp-vertex/core/lib/shared/lock-entry-expiry';
import type { ILockExpiryPolicy } from '@mcp-vertex/core/lib/contracts/interfaces/lock-entry-expiry.interface';

interface ILockEntry {
	readonly task_id?: string;
	readonly agent?: string;
	readonly ownership?: readonly string[];
	readonly last_seen?: string;
	readonly host?: string;
	readonly pid?: number;
}

const normalize = (path: string): string => path.replace(/^\.\//u, '');

export interface IPositiveOwnership {
	readonly agentId: string;
	readonly taskId: string;
	readonly ownedFiles: readonly string[];
}

/**
 * Read `.cache/mcp-vertex/agents.lock.json`, filter by agent+task,
 * drop expired entries, return the union of `ownership[]`.
 *
 * On any I/O or parse error, returns `[]` and the caller logs WARN.
 */
export const getPositiveOwnership = async (input: {
	readonly workspaceRoot: string;
	readonly agentId: string;
	readonly taskId: string;
	readonly policy: ILockExpiryPolicy;
	readonly lockFileRel?: string | undefined;
}): Promise<readonly string[]> => {
	const lockFileRel =
		input.lockFileRel ?? join('.cache', 'mcp-vertex', 'agents.lock.json');
	const lockFileAbs = join(input.workspaceRoot, lockFileRel);
	let parsed: { in_flight?: readonly ILockEntry[] };
	try {
		const raw = (
			await new SafeWorkspaceReader(dirname(lockFileAbs)).readText(
				basename(lockFileAbs),
			)
		).content;
		parsed = JSON.parse(raw) as { in_flight?: readonly ILockEntry[] };
	} catch {
		return [];
	}
	const owned = new Set<string>();
	for (const entry of parsed.in_flight ?? []) {
		if (entry.agent === undefined) continue;
		if (entry.agent !== input.agentId) continue;
		if (entry.task_id === undefined) continue;
		if (entry.task_id !== input.taskId) continue;
		if (isLockEntryExpired(entry, input.policy)) continue;
		for (const path of entry.ownership ?? []) {
			owned.add(normalize(path));
		}
	}
	return Array.from(owned);
};
