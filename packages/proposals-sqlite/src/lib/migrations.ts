/**
 * migrations.ts — q00022 S1 + x00511 S1.
 *
 * The migrations engine. Reads the migration files from
 * `./migrations/*.sql` in lexical order, computes a SHA-256 checksum
 * per file, applies them in order inside an IMMEDIATE transaction,
 * and refuses to apply a migration whose stored checksum differs
 * from the file's checksum (a deliberate review-time guard).
 *
 * Each migration's transaction is invoked via `tx.immediate()` (Bun
 * API for `BEGIN IMMEDIATE`) so concurrent writers cannot interleave
 * schema work. Previously the code called `tx()` which is `BEGIN`
 * (DEFERRED) — the docstring said IMMEDIATE but the call was
 * DEFERRED. (x00511.)
 *
 * Public surface:
 *   - `MIGRATION_FILES` — the list of migration files in order.
 *   - `MIGRATION_CHECKSUMS` — sha256 per file, computed at module load.
 *   - `applyMigrations(db)` — applies pending migrations; returns
 *     the list of versions applied (empty when the DB is up to date).
 *   - `currentSchemaVersion(db)` — the latest version in
 *     `schema_migrations`, or 0 when none.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

const readMigrationFile = (name: string): string =>
	readFileSync(join(MIGRATIONS_DIR, name), 'utf8');

const sha256Of = (text: string): string =>
	createHash('sha256').update(text).digest('hex');

/**
 * The raw SQL of one migration file. Exported (x00539 S1) so
 * `vocabulary.ts` can re-derive the CHECK enums from the same source
 * the engine applies — the TS vocabulary and the column enum cannot
 * drift without failing a test.
 */
export const readMigrationSource = (name: string): string =>
	readMigrationFile(name);

/**
 * Reads `./migrations/*.sql` in lexical order. Migration files must
 * be named `NNNN_description.sql` where NNNN is a 4+ digit version.
 */
const collectMigrationFiles = (): readonly string[] =>
	readdirSync(MIGRATIONS_DIR)
		.filter((name) => /^\d{4,}_.*\.sql$/.test(name))
		.sort();

export const MIGRATION_FILES = collectMigrationFiles();

/** SHA-256 per migration file, computed once at module load. */
export const MIGRATION_CHECKSUMS: Readonly<Record<string, string>> =
	Object.fromEntries(
		MIGRATION_FILES.map((name) => [
			name,
			sha256Of(readMigrationFile(name)),
		]),
	);

/** Returns the numeric version encoded in the file name. */
export const parseMigrationVersion = (name: string): number => {
	const match = /^(\d+)_.*\.sql$/.exec(name);
	if (!match) {
		throw new Error(
			`Invalid migration filename: ${name}. Expected <digits>_<description>.sql`,
		);
	}
	const version = match[1];
	if (version === undefined) {
		throw new Error(
			`Invalid migration filename: ${name}. Missing version.`,
		);
	}
	return Number.parseInt(version, 10);
};

/**
 * Current schema version in the DB (latest version in
 * `schema_migrations`). 0 when the table does not exist or is empty.
 */
export const currentSchemaVersion = (db: Database): number => {
	const row = db
		.query<{ name: string | null }, []>(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
		)
		.get();
	// No schema_migrations table yet → fresh DB → version 0.
	if (!row?.name) return 0;
	const versionRow = db
		.query<{ v: number }, []>(
			'SELECT MAX(version) AS v FROM schema_migrations',
		)
		.get();
	return versionRow?.v ?? 0;
};

/**
 * The migration files this build carries that the database has NOT
 * applied yet, in order.
 *
 * WHY it is derived from the SAME `MIGRATION_FILES` + `schema_migrations`
 * pair the applier uses, rather than from `user_version` or a count:
 * a second opinion about what is pending is a second migration system,
 * and the two would eventually disagree. A database with no
 * `schema_migrations` table is a fresh file, so everything is pending.
 */
export const pendingMigrationFiles = (db: Database): readonly string[] => {
	const table = db
		.query<{ name: string | null }, []>(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
		)
		.get();
	if (!table?.name) return MIGRATION_FILES;
	const applied = new Set(
		db
			.query<{ version: number }, []>(
				'SELECT version FROM schema_migrations',
			)
			.all()
			.map((row) => row.version),
	);
	return MIGRATION_FILES.filter(
		(name) => !applied.has(parseMigrationVersion(name)),
	);
};

/**
 * A schema object's SQL with comments and layout removed, so two scripts
 * that build the same object compare equal however they are formatted.
 */
const normalizeSql = (sql: string | null): string =>
	(sql ?? '')
		.replace(/\/\*[\s\S]*?\*\//gu, ' ')
		.replace(/--[^\n]*/gu, ' ')
		.replace(/\s+/gu, ' ')
		.replace(/\s*([(),;])\s*/gu, '$1')
		.trim()
		.toLowerCase();

/** Every schema object a database holds, excluding the migration ledger. */
const schemaOf = (db: Database): readonly string[] =>
	db
		.query<{ type: string; name: string; sql: string | null }, []>(
			"SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'",
		)
		.all()
		.map((row) => `${row.type} ${row.name} ${normalizeSql(row.sql)}`)
		.sort();

/**
 * Whether the migration files AS THEY ARE NOW build exactly the schema
 * this database already has, for the versions it has applied.
 *
 * WHY THIS AND NOT A LIST OF KNOWN CHECKSUMS. A checksum mismatch says
 * the file changed; it does not say the schema did. Editing a comment in
 * an applied migration made every older database refuse to open and
 * block all mutations as "corrupt", in this repository and in any project
 * that runs these migrations. Recording each such edit by hand would have
 * to happen in every repository, after someone had already been locked
 * out. Replaying the current files into a throwaway in-memory database
 * and comparing schemas answers the real question for any edit, in any
 * repository, and still refuses a change that alters what was built.
 */
const appliedSchemaMatchesFiles = (
	db: Database,
	stored: ReadonlyMap<number, { name: string; checksum: string }>,
): boolean => {
	// Built from the handle's own class rather than a runtime import of
	// `bun:sqlite`: `vocabulary.ts` reads this module under vitest, which
	// cannot resolve that specifier, and only this path ever needs it.
	const SqliteDatabase = db.constructor as new (path: string) => Database;
	const replay = new SqliteDatabase(':memory:');
	try {
		for (const name of MIGRATION_FILES) {
			if (!stored.has(parseMigrationVersion(name))) continue;
			replay.exec(readMigrationFile(name));
		}
		const expected = schemaOf(replay);
		const actual = schemaOf(db);
		return (
			expected.length === actual.length &&
			expected.every((entry, index) => entry === actual[index])
		);
	} catch {
		// A replay that cannot run proves nothing; keep refusing.
		return false;
	} finally {
		replay.close();
	}
};

export interface IMigrationApplyOutcome {
	readonly applied: readonly {
		readonly version: number;
		readonly name: string;
	}[];
	readonly totalApplied: number;
}

/**
 * Applies pending migrations. Each migration runs in its own
 * IMMEDIATE transaction. A migration whose stored checksum in
 * `schema_migrations` differs from the file's checksum raises
 * `MigrationChecksumMismatchError` — that is the guard against
 * editing an already-applied file.
 */
export const applyMigrations = (db: Database): IMigrationApplyOutcome => {
	// Ensure schema_migrations exists before reading it.
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			checksum TEXT NOT NULL,
			applied_at INTEGER NOT NULL
		);
	`);

	const stored = new Map<number, { name: string; checksum: string }>();
	for (const row of db
		.query<{ version: number; name: string; checksum: string }, []>(
			'SELECT version, name, checksum FROM schema_migrations',
		)
		.all()) {
		stored.set(row.version, { name: row.name, checksum: row.checksum });
	}

	const applied: { version: number; name: string }[] = [];
	const now = Date.now();
	for (const name of MIGRATION_FILES) {
		const version = parseMigrationVersion(name);
		const checksum = MIGRATION_CHECKSUMS[name] ?? '';
		const existing = stored.get(version);
		if (existing) {
			if (existing.checksum === checksum) continue;
			if (!appliedSchemaMatchesFiles(db, stored)) {
				throw new MigrationChecksumMismatchError(
					name,
					existing.checksum,
					checksum,
				);
			}
			// The file changed and the schema it builds did not — a comment,
			// whitespace, a reworded message. The database is not corrupt and
			// refusing it would block every mutation over nothing, so the
			// record is brought forward to the file it was proven against.
			db.prepare(
				'UPDATE schema_migrations SET checksum = ? WHERE version = ? AND checksum = ?',
			).run(checksum, version, existing.checksum);
			continue;
		}
		const sql = readMigrationFile(name);
		// SQLite cannot drop a foreign key in place, so a migration that
		// rebuilds a table follows the procedure SQLite documents for it:
		// foreign keys off, rebuild, `foreign_key_check`, on. The pragma is
		// a no-op inside a transaction, so it is toggled around this one,
		// and the check runs INSIDE it — a rebuild that broke a reference
		// rolls back instead of committing a damaged database.
		const rebuildsTables = sql.includes(FOREIGN_KEYS_OFF_MARKER);
		if (rebuildsTables) db.exec('PRAGMA foreign_keys = OFF;');
		// Invoke via `.immediate()` so the migration runs under
		// `BEGIN IMMEDIATE` and concurrent writers cannot interleave. The
		// bare `tx()` call shape defaults to `BEGIN` (DEFERRED); the
		// docstring has always claimed IMMEDIATE — this commit aligns the
		// code with the docstring. A spec pins the call shape so a future
		// refactor cannot regress it.
		const tx = db.transaction(() => {
			db.exec(sql);
			if (rebuildsTables) assertNoForeignKeyViolations(db, name);
			db.prepare(
				'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
			).run(version, name, checksum, now);
		});
		try {
			tx.immediate();
		} finally {
			if (rebuildsTables) db.exec('PRAGMA foreign_keys = ON;');
		}
		applied.push({ version, name });
	}

	return { applied, totalApplied: applied.length };
};

/**
 * A migration declaring this rebuilds tables, and runs under the
 * procedure SQLite documents for dropping a foreign key.
 */
const FOREIGN_KEYS_OFF_MARKER = '-- delendai:rebuilds-tables';

/** Rolls the rebuild back rather than committing dangling references. */
const assertNoForeignKeyViolations = (db: Database, name: string): void => {
	const violations = db
		.query<{ readonly table: string; readonly parent: string }, []>(
			'PRAGMA foreign_key_check;',
		)
		.all();
	if (violations.length === 0) return;
	const first = violations[0];
	throw new Error(
		`Migration ${name} left ${String(violations.length)} foreign key violation(s), starting with ${first?.table ?? 'unknown'} -> ${first?.parent ?? 'unknown'}. Nothing was applied.`,
	);
};

export class MigrationChecksumMismatchError extends Error {
	constructor(
		readonly fileName: string,
		readonly storedChecksum: string,
		readonly fileChecksum: string,
	) {
		super(
			`Migration checksum mismatch for ${fileName}: stored=${storedChecksum.slice(0, 12)}… file=${fileChecksum.slice(0, 12)}…. An applied migration must not be edited.`,
		);
		this.name = 'MigrationChecksumMismatchError';
	}
}
