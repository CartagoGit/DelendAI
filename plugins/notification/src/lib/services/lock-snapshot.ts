import { basename, dirname } from 'node:path';

import { SafeWorkspaceReader } from '@mcp-vertex/core/public';

import type { ILockSnapshot } from '../contracts/interfaces/wait-diagnosis.interface';

/**
 * Read the lock file *unfiltered*.
 *
 * `readInFlight` deliberately drops expired entries — a claim nobody is
 * refreshing is not held, and a waiter must not park on one. The timeout
 * diagnosis needs the opposite: an entry that is present but expired is
 * the difference between "nobody ever claimed this" and "its owner
 * stopped working", and those two facts lead to the same action but very
 * different explanations of what happened to the swarm. So the raw rows
 * are read here and classified by the diagnosis, rather than filtered
 * away before it can see them.
 *
 * Never throws: a missing or torn lock file reads as an empty snapshot,
 * which the diagnosis reports as `free-now`.
 */
export const readLockSnapshot = async (
	lockFile: string,
): Promise<ILockSnapshot> => {
	try {
		const raw = (
			await new SafeWorkspaceReader(dirname(lockFile)).readText(
				basename(lockFile),
			)
		).content;
		const parsed = JSON.parse(raw) as Partial<ILockSnapshot>;
		return {
			in_flight: Array.isArray(parsed.in_flight) ? parsed.in_flight : [],
			stale_after_minutes: parsed.stale_after_minutes,
		};
	} catch {
		return { in_flight: [] };
	}
};
