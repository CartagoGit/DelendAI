/**
 * index-reader-sql.ts — f00535 S1.
 *
 * The SQL twin of `readProposalIndex`. Same output shape
 * (`IProposalIndexEntry[]`), different source: the `proposals` table of
 * the SQLite projection at `.delendai/state/proposals.sqlite` instead of
 * `<cacheDir>/proposals/index.json`.
 *
 * ## Why this exists as its own module
 *
 * `readProposalIndex` is the single chokepoint of the index READ path —
 * 9 call sites inside this plugin go through it. Swapping its data
 * source is a one-function change, but only if the SQL read is a pure,
 * separately testable function with the exact same return shape. That
 * function is `readProposalIndexFromSql`; `index-reader.ts` (S2) is the
 * only production caller.
 *
 * ## `null` vs `[]` — the distinction the fallback is built on
 *
 * `null`  = "I cannot serve": no database file, unreadable file, a
 *           corrupt handle, a schema older than the one that introduced
 *           the `proposals` projection.
 * `[]`    = "I can serve, and the repository genuinely holds no
 *           proposals."
 *
 * Collapsing the two into `[]` is how the JSON fallback gets lost: the
 * caller would treat "database missing" as "empty repository" and every
 * consumer would silently see a repository with nothing in it. Every
 * failure path below returns `null`; the ONLY `[]` is a successful query
 * with zero rows.
 *
 * ## Field mapping (the fields the 9 consumers actually read)
 *
 *   `IProposalIndexEntry.id`     <- `proposals.uid`
 *   `IProposalIndexEntry.file`   <- `proposals.source_path`
 *   `IProposalIndexEntry.status` <- `proposals.status`
 *
 * Those three are the whole consumed surface, verified by grep over the
 * call sites and pinned by `index-reader-sql.spec.ts`:
 *   - `services/search.ts`                 -> id, file, status
 *   - `proposals/blocked-by.ts`            -> id, status
 *   - `tools/continue-proposal.tool.ts` x2 -> id, file, status
 *   - `tools/proposal-get.tool.ts`         -> file
 *   - `tools/incident-proposal.tool.ts`    -> file
 *
 * `source_path` is stored relative to the proposals directory — the same
 * shape `sync-proposal-registry.ts` writes into `index.json.file`
 * (`ready/feats/f00535-....md`), so callers that `join(proposalsDirAbs,
 * entry.file)` keep working unchanged.
 *
 * ## Why the import is dynamic
 *
 * `@delendai/proposals-sqlite` reaches `bun:sqlite`, which vitest cannot
 * resolve. A static import here would drag that module into every spec
 * that merely touches `index-reader.ts`. The import happens inside the
 * read, so a workspace (or a test) that never selects the SQL source
 * never loads it, and a resolution failure degrades to `null` like any
 * other "cannot serve".
 */
// effect-boundary-authorized: this module IS the read boundary for the
// proposals SQLite projection. It opens a strictly read-only handle and
// runs one SELECT; there is no ctx.effects adapter for SQLite reads and
// inventing one here would only wrap `@delendai/proposals-sqlite`.

import type { IProposalIndexEntry } from './index-reader';

/**
 * Lowest schema version that carries the `proposals` projection with
 * `uid` / `status` / `source_path` (migration `0001_initial.sql`).
 * Anything below cannot answer the index question, so it is a "cannot
 * serve" (`null`), not an empty repository.
 */
export const MIN_INDEX_SCHEMA_VERSION = 1;

/** One row of the projection, exactly as the SELECT below returns it. */
interface IProposalIndexRow {
	readonly uid: string;
	readonly status: string;
	readonly source_path: string | null;
}

/**
 * The minimal read-only handle this module needs. Declared structurally
 * so the spec can inject a fake without a real database, and so the
 * production wiring (`ProposalsSqliteDriver`) satisfies it as-is.
 */
export interface IReadonlyProposalsDb {
	readonly schemaVersion: number;
	query<TRow>(sql: string): { all(): readonly TRow[] };
	close(): void;
}

/** Opens a read-only handle, or returns `null` when it cannot. */
export type TOpenReadonlyProposalsDb = (
	databasePath: string,
) => IReadonlyProposalsDb | null;

export interface IReadProposalIndexFromSqlOptions {
	/** Absolute path to `proposals.sqlite`. */
	readonly databasePath: string;
	/** DIP seam; defaults to the real `ProposalsSqliteDriver`. */
	readonly open?: TOpenReadonlyProposalsDb;
}

/**
 * A successful read. `skipped` lists proposal uids present in the
 * projection but unusable as index entries because they carry no
 * `source_path` — they are reported, never dropped in silence.
 */
export interface ISqlProposalIndexResult {
	readonly entries: readonly IProposalIndexEntry[];
	readonly skipped: readonly string[];
	readonly sourceCommit: string | null;
	readonly logicalDigest: string | null;
}

/**
 * Production wiring: a TRUE read-only `ProposalsSqliteDriver`. A
 * read-only handle never creates the file nor its parent directory, so
 * calling this against a workspace with no projection is a no-op that
 * returns `null`.
 *
 * The import is dynamic on purpose — see the module header.
 */
export const openReadonlyProposalsDb = async (
	databasePath: string,
): Promise<IReadonlyProposalsDb | null> => {
	try {
		const { ProposalsSqliteDriver } = await import(
			'@delendai/proposals-sqlite'
		);
		const driver = new ProposalsSqliteDriver({
			path: databasePath,
			readonly: true,
		});
		// The driver exposes the raw `bun:sqlite` handle, not a query
		// method of its own; this adapter is the whole reason
		// `IReadonlyProposalsDb` exists as a structural port.
		return {
			get schemaVersion() {
				return driver.schemaVersion;
			},
			query: <TRow>(sql: string) => driver.handle.query<TRow, []>(sql),
			close: () => {
				driver.close();
			},
		};
	} catch {
		// Missing file, unreadable file, corrupt header, or
		// `bun:sqlite` unavailable in this runtime. All of them mean
		// "cannot serve".
		return null;
	}
};

/**
 * Read the proposal index out of the SQLite projection.
 *
 * Returns `null` when the projection cannot be served (absent,
 * unreadable, schema older than {@link MIN_INDEX_SCHEMA_VERSION}, or a
 * failing query) and a — possibly empty — result when it can. Never
 * throws.
 */
export const readProposalIndexResultFromSql = async (
	options: IReadProposalIndexFromSqlOptions,
): Promise<ISqlProposalIndexResult | null> => {
	const db =
		options.open === undefined
			? await openReadonlyProposalsDb(options.databasePath)
			: options.open(options.databasePath);
	if (db === null) return null;
	try {
		if (db.schemaVersion < MIN_INDEX_SCHEMA_VERSION) return null;
		const rows = db
			.query<IProposalIndexRow>(
				`SELECT uid, status, source_path
				 FROM proposals
				 ORDER BY uid ASC`,
			)
			.all();
		const entries: IProposalIndexEntry[] = [];
		const skipped: string[] = [];
		let sourceCommit: string | null = null;
		let logicalDigest: string | null = null;
		try {
			const run = db
				.query<{
					source_commit: string | null;
					logical_digest: string | null;
				}>(
					`SELECT source_commit, logical_digest
					 FROM reconciliation_runs
					 WHERE status = 'ok'
					 ORDER BY completed_at DESC, id DESC
					 LIMIT 1`,
				)
				.all()[0];
			sourceCommit = run?.source_commit ?? null;
			logicalDigest = run?.logical_digest ?? null;
		} catch {
			// Older projections may not have reconciliation metadata yet.
		}
		for (const row of rows) {
			if (
				typeof row.source_path !== 'string' ||
				row.source_path.length === 0
			) {
				skipped.push(row.uid);
				continue;
			}
			entries.push({
				id: row.uid,
				file: row.source_path,
				status: row.status,
			});
		}
		return {
			entries,
			skipped,
			sourceCommit,
			logicalDigest,
		};
	} catch {
		// A schema that has the version but not the table/columns, a
		// locked or truncated file, anything else: cannot serve.
		return null;
	} finally {
		try {
			db.close();
		} catch {
			// Closing a handle that is already gone is not a read failure.
		}
	}
};

/**
 * The shape `readProposalIndex` consumes: the same
 * `readonly IProposalIndexEntry[]` the JSON reader returns, or `null`
 * when the SQL source cannot serve.
 */
export const readProposalIndexFromSql = async (
	options: IReadProposalIndexFromSqlOptions,
): Promise<readonly IProposalIndexEntry[] | null> =>
	(await readProposalIndexResultFromSql(options))?.entries ?? null;
