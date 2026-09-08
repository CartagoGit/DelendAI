/**
 * db-path.ts — x00533 S1.
 *
 * THE single place where the location of the proposals database is
 * decided. Before this file there were three different answers for the
 * same file (workspace root, an arbitrary caller-supplied state dir, and
 * the `.delendai/state/proposals.sqlite` that q00022 declares), which
 * meant the reader and the reconciler could not be wired to the same
 * database.
 *
 * The canonical location is the one q00022 declares:
 *
 *   <workspaceRoot>/.delendai/state/proposals.sqlite
 *
 * with the shadow/staging database alongside it as
 * `proposals.sqlite.staging`, so that `.gitignore`'s `*.sqlite*` rules
 * cover both and a promotion is a rename inside one directory (same
 * filesystem, atomic).
 *
 * Nothing anywhere may build either path with a hand-written `join`.
 */
import { join } from 'node:path';

/** Directory segments, relative to the workspace root, of the state dir. */
export const PROPOSALS_STATE_DIR_SEGMENTS: readonly string[] = [
	'.delendai',
	'state',
];

/** File name of the active proposals database. */
export const PROPOSALS_DB_FILENAME = 'proposals.sqlite';

/** File name of the shadow/staging database, sibling of the active one. */
export const PROPOSALS_DB_STAGING_FILENAME = `${PROPOSALS_DB_FILENAME}.staging`;

export interface IProposalsDbPaths {
	/** `<workspaceRoot>/.delendai/state` — must exist before opening. */
	readonly stateDir: string;
	/** The active database every reader and writer must open. */
	readonly databasePath: string;
	/** The shadow database the reconciler builds before promotion. */
	readonly stagingPath: string;
}

export interface IResolveProposalsDbPathsOptions {
	/**
	 * Explicit state directory, overriding `<workspaceRoot>/.delendai/state`.
	 *
	 * This exists only for callers that already carry a state directory of
	 * their own (and for tests that lay out a fixture by hand). New code
	 * must pass the workspace root and let this function decide.
	 */
	readonly stateDir?: string;
}

/**
 * Resolves both the active and the staging database paths from a
 * workspace root.
 */
export const resolveProposalsDbPaths = (
	workspaceRoot: string,
	options?: IResolveProposalsDbPathsOptions,
): IProposalsDbPaths => {
	const stateDir =
		options?.stateDir ??
		join(workspaceRoot, ...PROPOSALS_STATE_DIR_SEGMENTS);
	return {
		stateDir,
		databasePath: join(stateDir, PROPOSALS_DB_FILENAME),
		stagingPath: join(stateDir, PROPOSALS_DB_STAGING_FILENAME),
	};
};
