/**
 * agent-lock-live-workers.ts — count the agents that currently hold a live
 * claim in the shared agent lock.
 *
 * Settlement needs to know how many workers are still active. No host
 * registers its workers with the settlement registry, but every worker
 * that edits files holds a claim in the lock file the proposals plugin
 * writes, and core owns the rule for when a claim stops counting. So the
 * count is read from that file with the same expiry rule the foreign-lock
 * filter and positive ownership use. It is a file read, not a dependency
 * on the proposals plugin.
 *
 * No lock file means no workers: commit-policy without proposals is a
 * supported setup. A lock that exists but cannot be read or parsed is
 * `null`, unknown and never zero, so a torn read mid-write cannot let
 * settlement start while agents are still working.
 */

import { basename, dirname } from 'node:path';

import { isLockEntryExpired, SafeWorkspaceReader } from '@delendai/core/public';
import type { ILockExpiryPolicy } from '@delendai/core/public';

interface ILiveLockEntry {
	readonly task_id?: string;
	readonly agent?: string;
	readonly last_seen?: string;
	readonly host?: string;
	readonly pid?: number;
}

const isMissingFile = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	(error as { readonly code?: unknown }).code === 'ENOENT';

export const countLiveAgentWorkers = async (input: {
	readonly lockFileAbs: string;
	readonly policy: ILockExpiryPolicy;
}): Promise<number | null> => {
	let raw: string;
	try {
		raw = (
			await new SafeWorkspaceReader(dirname(input.lockFileAbs)).readText(
				basename(input.lockFileAbs),
			)
		).content;
	} catch (error) {
		return isMissingFile(error) ? 0 : null;
	}
	let inFlight: unknown;
	try {
		inFlight = (JSON.parse(raw) as { readonly in_flight?: unknown })
			.in_flight;
	} catch {
		return null;
	}
	if (inFlight === undefined) return 0;
	if (!Array.isArray(inFlight)) return null;
	const workers = new Set<string>();
	for (const candidate of inFlight) {
		if (typeof candidate !== 'object' || candidate === null) continue;
		const entry = candidate as ILiveLockEntry;
		const worker = entry.agent ?? entry.task_id;
		if (worker === undefined) continue;
		if (isLockEntryExpired(entry, input.policy)) continue;
		workers.add(worker);
	}
	return workers.size;
};

/** The count as a zero-argument source, the shape the settlement tool takes. */
export const createLiveAgentWorkerCounter =
	(input: {
		readonly lockFileAbs: string;
		readonly policy: ILockExpiryPolicy;
	}): (() => Promise<number | null>) =>
	() =>
		countLiveAgentWorkers(input);
