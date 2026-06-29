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
}

export interface ILockFile {
	readonly in_flight?: readonly ILockEntry[];
}

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
 */
export const checkAgentClaims = (
	modifiedFiles: readonly string[],
	lockFileContent: string | null,
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

	const inFlight = lockData.in_flight || [];
	const unclaimed: string[] = [];

	for (const file of modifiedFiles) {
		const isClaimed = inFlight.some(
			(entry) => entry.ownership?.includes(file),
		);
		if (!isClaimed) {
			unclaimed.push(file);
		}
	}

	return unclaimed;
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

	if (unclaimed.length > 0) {
		console.error(
			`✖ agent-claims: ${unclaimed.length} modified file${
				unclaimed.length === 1 ? ' is' : 's are'
			} unclaimed (no active agent lock):`,
		);
		for (const file of unclaimed) {
			console.error(`  ${file}`);
		}
		console.error(
			'\n  Every modified tracked file must be claimed by an agent_lock before validation.',
			'\n  Please run: bun mcp-vertex_proposals_agent_lock claim --files=<paths>',
		);
		process.exit(2);
	}

	console.log(
		`✓ agent-claims: every modified file (${modified.length}) is claimed under an active agent lock.`,
	);
	process.exit(0);
}
