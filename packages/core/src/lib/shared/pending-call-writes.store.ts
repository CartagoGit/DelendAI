/**
 * pending-call-writes.store.ts — where a worktree keeps the tool writes
 * that are still to be committed: beside its own git metadata, so the
 * record is the worktree's and never part of a commit.
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type { IPendingCallWrite } from '../contracts/interfaces/pending-call-writes.interface';

const PENDING_FILE = 'delendai-pending-call-writes.json';

const pendingFileOf = async (git: IGitRunner): Promise<string | undefined> => {
	const gitDir = await git(['rev-parse', '--absolute-git-dir']);
	return gitDir.ok ? join(gitDir.output.trim(), PENDING_FILE) : undefined;
};

/** The pending writes of the worktree `git` runs in; none when unreadable. */
export const readPendingCallWrites = async (
	git: IGitRunner,
): Promise<readonly IPendingCallWrite[]> => {
	const file = await pendingFileOf(git);
	if (file === undefined) return [];
	try {
		const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
		return Array.isArray(parsed) ? (parsed as IPendingCallWrite[]) : [];
	} catch {
		return [];
	}
};

/** Replace the pending writes; an empty list removes the record. */
export const writePendingCallWrites = async (
	git: IGitRunner,
	pending: readonly IPendingCallWrite[],
): Promise<void> => {
	const file = await pendingFileOf(git);
	if (file === undefined) return;
	if (pending.length === 0) {
		await rm(file, { force: true });
		return;
	}
	await writeFile(file, `${JSON.stringify(pending, null, '\t')}\n`);
};
