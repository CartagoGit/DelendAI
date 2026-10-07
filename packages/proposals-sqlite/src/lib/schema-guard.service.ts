/**
 * schema-guard.service.ts — the one rule an older runtime must obey when
 * it opens a database a NEWER delendai wrote.
 *
 * WHY this exists: `applyMigrations` iterates the migration files THIS
 * build ships and skips the ones already recorded. A database carrying
 * versions the build has never heard of therefore looks, to that loop,
 * exactly like a database that is up to date — every file is applied, so
 * nothing is pending, so the sweep reports success. The runtime then
 * reads and WRITES a schema it does not know: columns it never selects,
 * CHECK constraints it cannot satisfy, triggers whose invariants it
 * breaks. Nothing announces the mismatch; the damage shows up later as
 * rows that no version of the code can explain.
 *
 * WHY refusal rather than repair: there is no honest repair. Rolling the
 * schema back means dropping whatever the newer migrations added — the
 * silent downgrade this guard exists to prevent — and guessing at a
 * forward migration this build does not carry is not possible. The two
 * real answers both belong to the operator: install the delendai that
 * wrote the file, or restore the database from before the downgrade.
 *
 * WHY only writable handles are guarded (see `sqlite-driver.ts`): a
 * read-only connection cannot migrate, cannot stamp `user_version` and
 * cannot write a row, so it cannot damage a future database — and the
 * doctor, whose whole job is to look at a database somebody is worried
 * about, opens read-only. A guard that blinded the diagnostic tool to
 * the very situation it diagnoses would be the wrong trade.
 */
import type { Database } from 'bun:sqlite';

import { currentSchemaVersion } from './migrations';
import { PROPOSALS_SQLITE_SCHEMA_VERSION } from './schema';

import type { ISchemaAheadFacts } from './schema-guard.interface';

export type { ISchemaAheadFacts } from './schema-guard.interface';

/**
 * The facts when the database is ahead of this build, or `null` when it
 * is at or behind it (the ordinary cases: fresh, current, migratable).
 */
export const readSchemaAhead = (db: Database): ISchemaAheadFacts | null => {
	const databaseVersion = currentSchemaVersion(db);
	if (databaseVersion <= PROPOSALS_SQLITE_SCHEMA_VERSION) return null;
	return {
		databaseVersion,
		runtimeVersion: PROPOSALS_SQLITE_SCHEMA_VERSION,
	};
};

/** The operator-facing sentence. One place, so every host says it the same way. */
export const describeSchemaAhead = (
	facts: ISchemaAheadFacts,
	databasePath?: string,
): string =>
	`The state database${databasePath === undefined ? '' : ` at ${databasePath}`} is at schema version ${String(
		facts.databaseVersion,
	)}, but this delendai build only carries schema version ${String(
		facts.runtimeVersion,
	)}. It was written by a NEWER delendai. Refusing to open it for writing: an older runtime must never migrate, downgrade or write to it. Install a delendai whose schema is at least ${String(
		facts.databaseVersion,
	)}, or restore the database from before the downgrade. Nothing was read, written, deleted or rebuilt.`;

export class SchemaAheadOfRuntimeError extends Error {
	constructor(
		readonly facts: ISchemaAheadFacts,
		readonly databasePath?: string,
	) {
		super(describeSchemaAhead(facts, databasePath));
		this.name = 'SchemaAheadOfRuntimeError';
	}
}

/**
 * Throws `SchemaAheadOfRuntimeError` when the database is ahead of this
 * build. Called before every migration sweep on a writable handle.
 */
export const assertSchemaWithinRuntime = (
	db: Database,
	databasePath?: string,
): void => {
	const ahead = readSchemaAhead(db);
	if (ahead === null) return;
	throw new SchemaAheadOfRuntimeError(ahead, databasePath);
};
