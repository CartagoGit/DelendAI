/**
 * index-reader-rebuild.ts
 *
 * The rebuild a `sql` read of the proposal index runs before it gives up:
 * the projection is rebuilt from the markdown, which is the authority,
 * whenever nothing would be lost by doing so.
 */

import { join, relative } from 'node:path';

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import { fileExists } from '../locks/lock-paths';
import type { IProposalIndexReadOptions } from './index-reader';
import {
	resolveDatabasePath,
	resolveWorkspaceRoot,
} from './index-reader-location';
import { noticeOnce } from './index-reader-notice';

/**
 * `attempted: false` = no rebuild ran at all (the caller's pre-existing
 * "cannot serve" path is unchanged). Otherwise `attempted: true` with
 * the fresh read — which can itself still be `null`/unstamped when the
 * rebuild ran but the projection remains unable to serve (a reconcile
 * that reported `failed`, for instance). A rebuild that ran and still
 * failed counts as a rebuild for the read stats.
 */
type TSqlRebuildAttempt<T> =
	| { readonly attempted: true; readonly result: T }
	| {
			readonly attempted: false;
			/**
			 * `false` when there is no workspace or database path to build
			 * into (a layout this reader does not recognise); `true` when
			 * there is one but rebuilding over it is unsafe (a corrupt file).
			 */
			readonly located: boolean;
	  };

const UNLOCATED = { attempted: false, located: false } as const;

/**
 * Rebuild the SQLite projection from markdown — the authority — and hand
 * back a fresh SQL read, but only when the reason `sql` could not serve
 * is one rebuilding can safely fix:
 *
 *   - the projection could not be opened at all (`fromSql === null`) and
 *     no file sits at the resolved database path — nothing has ever
 *     been built there ("missing"), so rebuilding loses nothing;
 *   - the projection opened but was never stamped by a reconcile
 *     (`fromSql.sourceCommit === null`) — the file exists, but no
 *     reconciliation ever promoted into it, so there is equally nothing
 *     to lose.
 *
 * A file that exists but could not be OPENED (`fromSql === null` and the
 * database path names a real file) is reported as corrupt instead:
 * overwriting it would erase the evidence of whatever went wrong, so
 * no rebuild runs and the caller throws as it always has. The
 * workspace root must also exist — a synthetic path a caller pinned (a
 * spec, or a misconfigured `workspaceRoot`) is not something this can
 * safely reconcile into, and skipping there is indistinguishable from
 * the pre-rebuild behaviour.
 *
 * Never throws. Returns `attempted: false` when no rebuild ran, so the
 * caller's existing "cannot serve" path is unchanged.
 */
export const attemptSqlRebuild = async <T>(
	indexPathAbs: string,
	options: IProposalIndexReadOptions | undefined,
	unopened: boolean,
	log: (message: string) => void,
	reread: () => Promise<T>,
): Promise<TSqlRebuildAttempt<T>> => {
	const root = await resolveWorkspaceRoot(indexPathAbs, options);
	if (root === null) return UNLOCATED;
	const exists = options?.pathExists ?? fileExists;
	if (!(await exists(root))) return UNLOCATED;
	if (unopened) {
		const databasePath = await resolveDatabasePath(indexPathAbs, options);
		if (databasePath === null) return UNLOCATED;
		// The file is there but this reader could not open it: corrupt,
		// locked, or truncated. Never rebuild over that.
		if (await exists(databasePath))
			return { attempted: false, located: true };
	}
	// Either nothing was ever built at the database path ("missing"), or
	// the file is there but never stamped ("unstamped") — both safe.
	const proposalsDirAbs =
		options?.proposalsDirAbs ??
		join(root, DEFAULT_PATH_LAYOUT.proposalsDir);
	const rebuild =
		options?.rebuildProjection ??
		(await import('../services/projection-refresh')).reconcileProjection;
	noticeOnce(
		`sql-rebuild:${indexPathAbs}`,
		`proposal index: SQLite projection unavailable for ${indexPathAbs}; rebuilding it from markdown before serving (this notice is emitted once per index path)`,
		log,
	);
	await rebuild({ root, proposalsDir: relative(root, proposalsDirAbs) });
	return { attempted: true, result: await reread() };
};
