import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	isLockEntryExpired,
} from '@mcp-vertex/core/public';

import type {
	ForeignLockProvider,
	IForeignLockHolding,
} from '../contracts/foreign-lock';
import type { ILockExpiryPolicy } from '@mcp-vertex/core/lib/contracts/interfaces/lock-entry-expiry.interface';

/**
 * Read the agent lock file that `proposals` writes, without importing
 * `proposals`.
 *
 * The file is a plain JSON document at a well-known path and its expiry
 * rule already lives in core precisely so that more than one plugin can
 * read it and agree. So this is a file reader, not a dependency: a host
 * running commit-policy with no proposals plugin simply has no such file
 * and every commit proceeds exactly as it does today.
 *
 * Expiry matters as much as presence. Withholding a file because of a
 * claim whose owner stopped working ten minutes ago would stall commits
 * on a lock the lock engine itself considers dead — the same "free and
 * held at once" contradiction that made waiters park on dead holders.
 * Same rule, same answer, one definition.
 */

interface ILockEntry {
	readonly task_id?: string;
	readonly agent?: string;
	readonly ownership?: readonly string[];
	readonly last_seen?: string;
	readonly host?: string;
	readonly pid?: number;
}

const normalize = (path: string): string => path.replace(/^\.\//u, '');

export const createAgentLockForeignLockProvider = (input: {
	readonly lockFileAbs: string;
	readonly policy: ILockExpiryPolicy;
}): ForeignLockProvider => {
	return async ({ files, selfAgent }) => {
		let parsed: { in_flight?: readonly ILockEntry[] };
		try {
			const raw = (
				await new SafeWorkspaceReader(
					dirname(input.lockFileAbs),
				).readText(basename(input.lockFileAbs))
			).content;
			parsed = JSON.parse(raw) as { in_flight?: readonly ILockEntry[] };
		} catch {
			// No lock file, or a torn one mid-write. Either way there is
			// nothing trustworthy to withhold on, and a commit must not
			// fail because a advisory read did.
			return [];
		}
		const wanted = new Set(files.map(normalize));
		const holdings: IForeignLockHolding[] = [];
		for (const entry of parsed.in_flight ?? []) {
			if (entry.agent === undefined) continue;
			// Our own claim is the reason we are committing.
			if (selfAgent !== undefined && entry.agent === selfAgent) continue;
			if (isLockEntryExpired(entry, input.policy)) continue;
			for (const owned of entry.ownership ?? []) {
				const file = normalize(owned);
				if (!wanted.has(file)) continue;
				holdings.push({
					file,
					agent: entry.agent,
					taskId: entry.task_id ?? 'unknown',
				});
			}
		}
		return holdings;
	};
};

/** Conventional location of the shared lock, relative to the workspace. */
export const deriveAgentLockPath = (workspaceRoot: string): string =>
	join(workspaceRoot, '.cache', 'mcp-vertex', 'agents.lock.json');
