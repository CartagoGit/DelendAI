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
			if (existing.checksum !== checksum) {
				throw new MigrationChecksumMismatchError(
					name,
					existing.checksum,
					checksum,
				);
			}
			continue;
		}
		const sql = readMigrationFile(name);
		// Invoke via `.immediate()` so the migration runs under
		// `BEGIN IMMEDIATE` and concurrent writers cannot interleave. The
		// bare `tx()` call shape defaults to `BEGIN` (DEFERRED); the
		// docstring has always claimed IMMEDIATE — this commit aligns the
		// code with the docstring. A spec pins the call shape so a future
		// refactor cannot regress it.
		const tx = db.transaction(() => {
			db.exec(sql);
			db.prepare(
				'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
			).run(version, name, checksum, now);
		});
		tx.immediate();
		applied.push({ version, name });
	}

	return { applied, totalApplied: applied.length };
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
