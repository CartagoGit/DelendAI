/**
 * db-path.ts — x00533 S1.
 *
 * THE single place where the location of the proposals database is
 * decided. Before this file there were three different answers for the
 * same file (workspace root, an arbitrary caller-supplied state dir, and
 * a hidden `.delendai/state/` directory), which meant the reader and the
 * reconciler could not be wired to the same database.
 *
 * The canonical location is:
 *
 *   <workspaceRoot>/.cache/delendai/state/proposals.sqlite
 *
 * ## Why `.cache/delendai/`, not a top-level `.delendai/`
 *
 * The database is a PROJECTION, not a source of truth: the markdown
 * under `docs/delendai/proposals/` is, and the reconciler rebuilds the
 * database from it deterministically (`db-reconcile` promotes a shadow
 * build over the active file). A regenerable projection is a cache, and
 * this repo has exactly one cache root — `<workspaceRoot>/.cache/`,
 * enforced by `tools/scripts/lint/check-cache.script.ts`, which fails on
 * any `.cache` directory outside the root. The sibling projection
 * `.cache/delendai/proposals/index.json` already lived there, so the old
 * top-level `.delendai/state/` was the single outlier: it made a
 * throwaway artefact look like committed workspace state and needed its
 * own `.gitignore` entry to stay out of history.
 *
 * The staging/shadow database sits alongside the active one as
 * `proposals.sqlite.staging`, so that `.gitignore`'s `*.sqlite*` rules
 * cover both and a promotion is a rename inside one directory (same
 * filesystem, therefore atomic).
 *
 * Nothing anywhere may build either path with a hand-written `join`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Directory segments, relative to the workspace root, of the state dir. */
export const PROPOSALS_STATE_DIR_SEGMENTS: readonly string[] = [
	'.cache',
	'delendai',
	'state',
];

/**
 * Where the database lived before it was recognised as a cache artefact.
 *
 * Deliberately NOT exported: no caller may ever open a database here
 * again. It exists only so a clone that predates the move is detected
 * instead of being handed a fresh, empty database at the new path — see
 * `assertNoUnmigratedLegacyDatabase`.
 */
const LEGACY_STATE_DIR_SEGMENTS: readonly string[] = ['.delendai', 'state'];

/** File name of the active proposals database. */
export const PROPOSALS_DB_FILENAME = 'proposals.sqlite';

/** File name of the shadow/staging database, sibling of the active one. */
export const PROPOSALS_DB_STAGING_FILENAME = `${PROPOSALS_DB_FILENAME}.staging`;

export interface IProposalsDbPaths {
	/** `<workspaceRoot>/.cache/delendai/state` — must exist before opening. */
	readonly stateDir: string;
	/** The active database every reader and writer must open. */
	readonly databasePath: string;
	/** The shadow database the reconciler builds before promotion. */
	readonly stagingPath: string;
}

export interface IResolveProposalsDbPathsOptions {
	/**
	 * Explicit state directory, overriding
	 * `<workspaceRoot>/.cache/delendai/state`.
	 *
	 * This exists only for callers that already carry a state directory of
	 * their own (and for tests that lay out a fixture by hand). New code
	 * must pass the workspace root and let this function decide.
	 */
	readonly stateDir?: string;
}

/**
 * Builds the operator-facing remedy for a clone whose database is still
 * at the pre-move location.
 *
 * The command moves the sidecars too: SQLite in WAL mode keeps
 * `-wal` (uncheckpointed commits) and `-shm` (the shared index) next to
 * the main file, and moving only `proposals.sqlite` would leave the most
 * recent transactions behind in an orphaned WAL.
 */
const formatLegacyDatabaseRemedy = (
	legacyStateDir: string,
	stateDir: string,
): string =>
	[
		`The proposals database is still at the pre-move location ${legacyStateDir}, `,
		`and nothing has been written to the canonical location ${stateDir} yet.`,
		'\n\nThe database moved to the repo cache root because it is a ',
		'regenerable projection of docs/delendai/proposals/, not committed state.',
		'\n\nMove it (the -wal/-shm sidecars carry commits the main file does not):',
		`\n\n  mkdir -p ${stateDir} && mv ${join(legacyStateDir, `${PROPOSALS_DB_FILENAME}*`)} ${stateDir}/`,
		'\n\nOr discard it and rebuild from the markdown with the ',
		'`proposals_db_reconcile` tool, which is the supported way to recreate it.',
	].join('');

/**
 * Refuses to hand back the new path while an un-migrated database sits at
 * the old one.
 *
 * WHY fail loudly instead of moving the file automatically: this resolver
 * is a pure path function called from ~20 sites (readers, the reconciler,
 * db-doctor, db-status), several of them while another process may hold
 * the database open. An automatic rename would have to move four files
 * (`.sqlite`, `-wal`, `-shm`, `.staging`) atomically, survive a
 * cross-device `.delendai` -> `.cache` move, and do it without an
 * exclusive lock — four failure modes whose partial outcomes are exactly
 * the data loss this guard exists to prevent. A one-line `existsSync`
 * predicate has none of them and is provable with a single fixture.
 *
 * The check is skipped once the canonical database exists, so a clone
 * that has already migrated is never re-tripped by a leftover old file.
 */
const assertNoUnmigratedLegacyDatabase = (
	workspaceRoot: string,
	stateDir: string,
	databasePath: string,
): void => {
	if (existsSync(databasePath)) return;
	const legacyStateDir = join(workspaceRoot, ...LEGACY_STATE_DIR_SEGMENTS);
	if (!existsSync(join(legacyStateDir, PROPOSALS_DB_FILENAME))) return;
	throw new Error(formatLegacyDatabaseRemedy(legacyStateDir, stateDir));
};

/**
 * Resolves both the active and the staging database paths from a
 * workspace root.
 *
 * Throws when the workspace still carries a database at the pre-move
 * `.delendai/state/` location and the canonical one does not exist yet:
 * returning the new path there would silently open a second, empty
 * database, which reads as total data loss to the operator.
 */
export const resolveProposalsDbPaths = (
	workspaceRoot: string,
	options?: IResolveProposalsDbPathsOptions,
): IProposalsDbPaths => {
	const stateDir =
		options?.stateDir ??
		join(workspaceRoot, ...PROPOSALS_STATE_DIR_SEGMENTS);
	const databasePath = join(stateDir, PROPOSALS_DB_FILENAME);
	// An explicit stateDir is a caller that already decided where its
	// database lives (fixtures, the staging builder); the legacy layout is
	// not its concern and the override must behave exactly as before.
	if (options?.stateDir === undefined) {
		assertNoUnmigratedLegacyDatabase(workspaceRoot, stateDir, databasePath);
	}
	return {
		stateDir,
		databasePath,
		stagingPath: join(stateDir, PROPOSALS_DB_STAGING_FILENAME),
	};
};
