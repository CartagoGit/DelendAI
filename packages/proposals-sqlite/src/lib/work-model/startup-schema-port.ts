/**
 * startup-schema-port.ts — the one startup port that has no repository.
 *
 * WHY it lives here and not in `@delendai/core`: every answer it gives
 * comes from THIS package's migration engine (`migrations.ts`), THIS
 * package's version constant (`schema.ts`) and SQLite's own pragmas.
 * Core declares the questions; the storage engine is the only thing that
 * can answer them, and it must never be a second migration system.
 *
 * WHY `applyMigrations` reports nothing as ambiguous: the engine has
 * exactly one classification — a migration is applied or it is pending —
 * and its checksum guard turns "this file changed after it was applied"
 * into a thrown error rather than a silent re-application. Inventing an
 * "ambiguous" bucket here would mean inventing the judgement behind it.
 *
 * WHY projection staleness is answered from the FTS5 indexes and nothing
 * else: they are the only DERIVED content in this database — trigger-fed
 * mirrors of `proposals`, `plans` and `slices`, rebuilt verbatim by
 * migration 0010. Their staleness is decidable without leaving the file
 * (FTS5's own `integrity-check`, plus a row-count comparison against the
 * source table that catches rows written while a trigger did not exist),
 * and their rebuild is deterministic and non-destructive: the source
 * rows are the truth, the index is thrown away and recomputed from them.
 * Reporting "nothing is stale" for anything whose freshness this file
 * cannot decide would be the fabricated all-clear the reconciler exists
 * to prevent, so nothing else is claimed here at all.
 */
import type { Database } from 'bun:sqlite';

import type { IStartupStatePorts } from '@delendai/core/public';

import {
	applyMigrations,
	currentSchemaVersion,
	pendingMigrationFiles,
} from '../migrations';
import { PROPOSALS_SQLITE_SCHEMA_VERSION } from '../schema';

type TSchemaPort = IStartupStatePorts['schema'];
type TIntegrityResult = ReturnType<TSchemaPort['integrityCheck']>;
type TSweepResult = ReturnType<TSchemaPort['applyMigrations']>;

/** A trigger-fed FTS5 mirror and the table it mirrors. */
interface IFtsProjection {
	readonly name: string;
	readonly source: string;
}

const FTS_PROJECTIONS: readonly IFtsProjection[] = [
	{ name: 'proposals_fts', source: 'proposals' },
	{ name: 'plans_fts', source: 'plans' },
	{ name: 'slices_fts', source: 'slices' },
];

/** The first string column of a pragma row, whatever it is called. */
const firstText = (row: Readonly<Record<string, unknown>>): string | null => {
	for (const value of Object.values(row)) {
		if (typeof value === 'string') return value;
	}
	return null;
};

const objectExists = (db: Database, name: string): boolean => {
	const row = db
		.query<{ readonly name: string }, [string]>(
			'SELECT name FROM sqlite_master WHERE name = ?',
		)
		.get(name);
	return row !== null && row !== undefined;
};

const rowCount = (db: Database, table: string): number =>
	db
		.query<{ readonly c: number }, []>(`SELECT count(*) AS c FROM ${table}`)
		.get()?.c ?? 0;

/**
 * `PRAGMA integrity_check` plus `PRAGMA foreign_key_check`. Both are
 * reported, because a database whose pages are intact but whose rows
 * point at parents that no longer exist is damaged in the way that
 * matters to a reconciler.
 */
const runIntegrityCheck = (db: Database): TIntegrityResult => {
	const problems: string[] = [];
	const rows = db
		.query<Readonly<Record<string, unknown>>, []>('PRAGMA integrity_check;')
		.all();
	const details = rows
		.map((row) => firstText(row))
		.filter((value): value is string => value !== null);
	if (!(details.length === 1 && details[0] === 'ok')) {
		problems.push(...details);
	}
	const violations = db
		.query<
			{
				readonly table: string;
				readonly rowid: number | null;
				readonly parent: string;
			},
			[]
		>('PRAGMA foreign_key_check;')
		.all();
	for (const violation of violations) {
		problems.push(
			`foreign key violation in ${violation.table} (row ${String(
				violation.rowid ?? -1,
			)}) referencing ${violation.parent}`,
		);
	}
	return { ok: problems.length === 0, problems };
};

/**
 * True when the FTS5 index no longer agrees with its source. Two
 * independent questions, because they fail differently: FTS5's own
 * `integrity-check` catches a damaged index, and the row-count
 * comparison catches an index that is internally consistent but was
 * never told about rows the source table has.
 */
const isProjectionStale = (
	db: Database,
	projection: IFtsProjection,
): boolean => {
	if (
		!objectExists(db, projection.name) ||
		!objectExists(db, projection.source)
	) {
		// The schema that owns the projection is not in this database
		// yet. Absent is not stale, and a migration — not this port —
		// is what brings it into existence.
		return false;
	}
	try {
		db.exec(
			`INSERT INTO ${projection.name}(${projection.name}) VALUES('integrity-check');`,
		);
	} catch {
		return true;
	}
	return rowCount(db, projection.name) !== rowCount(db, projection.source);
};

/**
 * Recompute one FTS5 index from its source table, exactly as migration
 * 0010 does. Only the DERIVED rows are deleted; the source table is
 * read and never written.
 */
const rebuildProjection = (db: Database, projection: IFtsProjection): void => {
	const tx = db.transaction(() => {
		db.exec(`DELETE FROM ${projection.name};`);
		db.exec(
			`INSERT INTO ${projection.name} (uid, title, body)
			 SELECT uid, title, '' FROM ${projection.source};`,
		);
	});
	tx.immediate();
};

/** Returns whether the recompute committed. See `rebuildProjections`. */
const tryRebuild = (db: Database, projection: IFtsProjection): boolean => {
	try {
		rebuildProjection(db, projection);
		return true;
	} catch {
		return false;
	}
};

/**
 * Bind the schema port to an open database. The connection is supplied
 * by the caller because the driver has already applied migrations on it:
 * this port reports what that sweep left behind and can apply a later
 * one, but it never opens a second connection with different pragmas.
 */
export const createStartupSchemaPort = (db: Database): TSchemaPort => ({
	integrityCheck: (): TIntegrityResult => runIntegrityCheck(db),
	currentVersion: (): number => currentSchemaVersion(db),
	targetVersion: (): number => PROPOSALS_SQLITE_SCHEMA_VERSION,
	pendingMigrations: (): readonly string[] => pendingMigrationFiles(db),
	applyMigrations: (): TSweepResult => ({
		applied: applyMigrations(db).applied.map((entry) => entry.name),
		// See the file header: this engine has no ambiguous class.
		ambiguous: [],
	}),
	staleProjections: (): readonly string[] =>
		FTS_PROJECTIONS.filter((projection) =>
			isProjectionStale(db, projection),
		).map((projection) => projection.name),
	rebuildProjections: (names: readonly string[]): readonly string[] => {
		const rebuilt: string[] = [];
		for (const projection of FTS_PROJECTIONS) {
			if (!names.includes(projection.name)) continue;
			// A rebuild that fails leaves the index exactly as it was
			// (the whole recompute is one transaction) and is reported
			// by OMISSION: this port's vocabulary can say "rebuilt" and
			// nothing else, so naming a projection it could not repair
			// would be a fabricated repair, and throwing would abort a
			// boot over a derived index that the next boot will find
			// stale again and retry.
			if (tryRebuild(db, projection)) rebuilt.push(projection.name);
		}
		return rebuilt;
	},
});
