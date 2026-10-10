/**
 * index-reader-stale.ts
 *
 * A projection built from an older tree of the proposals is rebuilt
 * before it answers.
 *
 * The markdown is the authority and the SQLite projection a copy of it,
 * stamped with the commit it was built from. A `git pull` or a merge
 * changes the markdown without anybody calling `sync_proposals`, and the
 * reader went on serving the copy: on 2026-10-10 `proposals status`
 * reported 2 proposals in progress, 19 ready and 34 in review while the
 * tree held 6, 12 and 17. Nothing was missing or unstamped, so nothing
 * was rebuilt; it was only old.
 *
 * Old is decided by content, not by commit: the tree of the proposals
 * directory at the stamped commit against the tree at HEAD. A hundred
 * commits that touch no proposal leave the projection current, and cost
 * two `git rev-parse` calls to find out.
 *
 * A proposal edited by hand and not committed is the authority too. The
 * projection records when it was last rebuilt, so any file or directory
 * of the tree modified after that makes it old as well, once: the
 * rebuild that follows is newer than the edit. A rebuild takes seconds and a check takes
 * milliseconds, so the check has to be exact rather than cautious.
 */
import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import { fileExists } from '../locks/lock-paths';
import type { IProposalIndexReadOptions } from './index-reader';
import { resolveWorkspaceRoot } from './index-reader-location';
import { noticeOnce } from './index-reader-notice';
import type { IStaleProjectionSeams } from '../contracts/interfaces/stale-projection-seams.interface';

/** A stamp that names a commit: an abbreviated or a full object id. */
const COMMIT = /^[0-9a-f]{7,}$/u;

/** The files a proposals tree is made of. */
const MARKDOWN_SUFFIX = '.md';

const gitTreeOf = (
	root: string,
	revision: string,
	dir: string,
): Promise<string | null> =>
	new Promise((resolve) => {
		execFile(
			'git',
			['rev-parse', '--verify', '--quiet', `${revision}:${dir}`],
			{ cwd: root, encoding: 'utf8' },
			(error, stdout) => {
				const tree = stdout.trim();
				resolve(error === null && tree.length > 0 ? tree : null);
			},
		);
	});

/**
 * Whether anything under `dirAbs` was modified after `sinceMs`: a file
 * edited, added or put back, or a directory something was added to or
 * removed from. Read from the file system, not from git: a hand edit
 * that was reverted leaves nothing for git to report and the projection
 * built in between would stay wrong, and a project need not be a
 * repository at all.
 */
/** When `path` was last modified; a path that cannot be read counts as now. */
const modifiedAt = (path: string): Promise<number> =>
	stat(path).then(
		(found) => found.mtimeMs,
		() => Number.POSITIVE_INFINITY,
	);

const modifiedSince = async (
	dirAbs: string,
	sinceMs: number,
): Promise<boolean> => {
	const entries: Dirent[] | null = await readdir(dirAbs, {
		withFileTypes: true,
	}).catch(() => null);
	if (entries === null) return false;
	if ((await modifiedAt(dirAbs)) > sinceMs) return true;
	for (const entry of entries) {
		const path = join(dirAbs, entry.name);
		const newer = entry.isDirectory()
			? await modifiedSince(path, sinceMs)
			: entry.name.endsWith(MARKDOWN_SUFFIX) &&
				(await modifiedAt(path)) > sinceMs;
		if (newer) return true;
	}
	return false;
};

/**
 * The projection to serve: `current`, or a fresh read of it after a
 * rebuild when the proposals tree moved since it was stamped. `current`
 * is handed back when it is up to date, when nothing here can tell (a
 * stamp that is not a commit, a workspace that is not a repository: an
 * unknown is not a reason to rebuild), or when the rebuild left nothing
 * better to serve.
 */
export const levelStaleProjection = async <
	T extends {
		readonly sourceCommit: string | null;
		readonly reconciledAt?: number | null | undefined;
	},
>(
	indexPathAbs: string,
	options: IProposalIndexReadOptions | undefined,
	current: T,
	log: (message: string) => void,
	reread: () => Promise<T | null>,
): Promise<T> => {
	const sourceCommit = current.sourceCommit;
	if (sourceCommit === null || !COMMIT.test(sourceCommit)) return current;
	const root = await resolveWorkspaceRoot(indexPathAbs, options);
	if (root === null) return current;
	const exists = options?.pathExists ?? fileExists;
	if (!(await exists(root))) return current;
	const proposalsDirAbs =
		options?.proposalsDirAbs ??
		join(root, DEFAULT_PATH_LAYOUT.proposalsDir);
	const dir = relative(root, proposalsDirAbs);
	const treeOf = options?.treeOf ?? gitTreeOf;
	const now = await treeOf(root, 'HEAD', dir);
	if (now === null) return current;
	const committedMoved = (await treeOf(root, sourceCommit, dir)) !== now;
	const since = current.reconciledAt ?? null;
	const editedByHand =
		!committedMoved &&
		since !== null &&
		(await (options?.changedSince ?? modifiedSince)(
			proposalsDirAbs,
			since,
		));
	if (!committedMoved && !editedByHand) return current;
	const rebuild =
		options?.rebuildProjection ??
		(await import('../services/projection-refresh')).reconcileProjection;
	noticeOnce(
		`sql-stale:${indexPathAbs}:${now}:${String(editedByHand)}`,
		`proposal index: the SQLite projection for ${indexPathAbs} was built from ${sourceCommit.slice(0, 9)} and the proposals changed since${editedByHand ? ' (edited on disk)' : ''}; rebuilding it from markdown before serving`,
		log,
	);
	await rebuild({ root, proposalsDir: dir });
	const fresh = await reread();
	return fresh === null || fresh.sourceCommit === null ? current : fresh;
};
