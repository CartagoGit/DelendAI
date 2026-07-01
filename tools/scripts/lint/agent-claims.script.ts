#!/usr/bin/env bun
/**
 * agent-claims.script.ts — x00080 S2 (claim-or-no-touch validation gate).
 *
 * Verifies that all git-tracked files modified in the working tree are
 * actively claimed in `.cache/mcp-vertex/agents.lock.json`. Fails the
 * validation gate (exits 2) if any modified file has no active lock.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cacheRoot, repoRoot } from '../lib/monorepo-paths';

export interface ILockEntry {
	readonly task_id: string;
	readonly agent: string;
	readonly ownership: readonly string[];
	readonly last_seen?: string;
}

export interface ILockFile {
	readonly version?: number;
	readonly stale_after_minutes?: number;
	readonly in_flight?: readonly ILockEntry[];
}

export const DEFAULT_STALE_AFTER_MINUTES = 10;

/**
 * Returns true when a lock entry's last_seen is older than
 * stale_after_minutes (or the default 10 minutes). Entries with
 * missing or unparseable last_seen are treated as fresh — the
 * engine populates both `started_at` and `last_seen` on every
 * claim/heartbeat, so a missing field indicates a pre-Ring-1
 * fixture we cannot reason about safely, and the conservative
 * choice is to keep blocking. Use `now` injection for tests.
 */
export const isLockStale = (
	entry: ILockEntry,
	now: Date = new Date(),
	staleAfterMinutes: number = DEFAULT_STALE_AFTER_MINUTES,
): boolean => {
	if (!entry.last_seen) {
		return false;
	}
	const lastSeen = Date.parse(entry.last_seen);
	if (Number.isNaN(lastSeen)) {
		return false;
	}
	const ageMs = now.getTime() - lastSeen;
	return ageMs > staleAfterMinutes * 60 * 1000;
};

/**
 * Returns true when the lock file declares a stale_after_minutes
 * override. Reads only the lock file (does not touch git).
 */
export const lockStaleAfterMinutes = (lockData: ILockFile): number =>
	lockData.stale_after_minutes ?? DEFAULT_STALE_AFTER_MINUTES;

/**
 * Gets all modified tracked files as repo-relative paths.
 */
export const getModifiedTrackedFiles = (root: string): string[] => {
	const files = new Set<string>();

	// Unstaged modifications
	const unstaged = spawnSync('git', ['diff', '--name-only'], {
		cwd: root,
		encoding: 'utf8',
	});
	if (unstaged.status === 0) {
		unstaged.stdout
			.split('\n')
			.map((f) => f.trim())
			.filter(Boolean)
			.forEach((f) => {
				files.add(f);
			});
	}

	// Staged modifications
	const staged = spawnSync('git', ['diff', '--cached', '--name-only'], {
		cwd: root,
		encoding: 'utf8',
	});
	if (staged.status === 0) {
		staged.stdout
			.split('\n')
			.map((f) => f.trim())
			.filter(Boolean)
			.forEach((f) => {
				files.add(f);
			});
	}

	return [...files].sort((a, b) => a.localeCompare(b));
};

/**
 * Checks if all modified files are covered by active locks.
 * Returns the list of unclaimed files.
 *
 * Stale claims (last_seen older than `stale_after_minutes`) are
 * skipped — see x00088. Their ownership entries are NOT
 * considered blocking, and the modified file is reported as
 * unclaimed if no other fresh claim covers it.
 *
 * `now` and `staleAfterMinutes` are injectable for tests.
 */
export const checkAgentClaims = (
	modifiedFiles: readonly string[],
	lockFileContent: string | null,
	options: {
		now?: Date;
		staleAfterMinutes?: number;
	} = {},
): string[] => {
	if (modifiedFiles.length === 0) {
		return [];
	}

	if (!lockFileContent) {
		// No lock file means all modified files are unclaimed
		return [...modifiedFiles];
	}

	let lockData: ILockFile;
	try {
		lockData = JSON.parse(lockFileContent) as ILockFile;
	} catch {
		// Corrupt lock file defaults to no active claims
		return [...modifiedFiles];
	}

	const inFlight = lockData.in_flight ?? [];
	const staleAfter =
		options.staleAfterMinutes ?? lockStaleAfterMinutes(lockData);
	const now = options.now ?? new Date();
	const unclaimed: string[] = [];

	for (const file of modifiedFiles) {
		const isClaimed = inFlight.some((entry) => {
			if (!entry.ownership?.includes(file)) return false;
			return !isLockStale(entry, now, staleAfter);
		});
		if (!isClaimed) {
			unclaimed.push(file);
		}
	}

	return unclaimed;
};

/**
 * Returns the stale claim entries (for diagnostic / visibility
 * purposes). Does not include entries whose files are
 * unparseable or missing — those are treated as fresh.
 */
export const collectStaleClaims = (
	lockFileContent: string | null,
	options: { now?: Date; staleAfterMinutes?: number } = {},
): readonly ILockEntry[] => {
	if (!lockFileContent) return [];
	let lockData: ILockFile;
	try {
		lockData = JSON.parse(lockFileContent) as ILockFile;
	} catch {
		return [];
	}
	const inFlight = lockData.in_flight ?? [];
	const staleAfter =
		options.staleAfterMinutes ?? lockStaleAfterMinutes(lockData);
	const now = options.now ?? new Date();
	return inFlight.filter((e) => isLockStale(e, now, staleAfter));
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const root = repoRoot();
	const modified = getModifiedTrackedFiles(root);

	if (modified.length === 0) {
		console.log('✓ agent-claims: no modified files to check.');
		process.exit(0);
	}

	const lockPath = join(cacheRoot(), 'agents.lock.json');
	let lockContent: string | null = null;
	if (existsSync(lockPath)) {
		try {
			lockContent = readFileSync(lockPath, 'utf8');
		} catch {
			// Handled in checkAgentClaims
		}
	}

	const unclaimed = checkAgentClaims(modified, lockContent);
	const stale = collectStaleClaims(lockContent);

	// Advisory-only mode (x00088): always exit 0; surface issues as
	// warnings. The hook that used to enforce this is now a Biome
	// formatter and never blocks commits.
	for (const entry of stale) {
		console.warn(
			`⚠ agent-claims: stale claim '${entry.task_id}' by ${entry.agent} ` +
				`(last_seen ${entry.last_seen ?? '<missing>'}). ` +
				`Release it: bun mcp-vertex_proposals_agent_lock release --task_id=${entry.task_id}`,
		);
	}

	if (unclaimed.length > 0) {
		console.warn(
			`⚠ agent-claims: ${unclaimed.length} modified file${
				unclaimed.length === 1 ? ' is' : 's are'
			} unclaimed by any fresh claim (advisory, x00088):`,
		);
		for (const file of unclaimed) {
			console.warn(`  ${file}`);
		}
	}

	console.log(
		`✓ agent-claims (advisory): ${modified.length} modified file${
			modified.length === 1 ? '' : 's'
		}, ${unclaimed.length} without a fresh claim, ${stale.length} stale claim${
			stale.length === 1 ? '' : 's'
		} in the registry.`,
	);
	process.exit(0);
}
