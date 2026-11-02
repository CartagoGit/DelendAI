/**
 * Contract shapes for `./schema-guard.service`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `schema-guard.service.ts`
 * keeps the behaviour, this file keeps the shapes. Re-exported from
 * `schema-guard.service.ts`, so no import site changes.
 */

/**
 * A database whose `schema_migrations` table records a version this
 * build does not carry. Both numbers are reported because the operator's
 * decision (upgrade the runtime, or restore the file) depends on the gap
 * and not on the fact that one exists.
 */
export interface ISchemaAheadFacts {
	/** MAX(version) in the database's own `schema_migrations`. */
	readonly databaseVersion: number;
	/** The highest migration THIS build ships. */
	readonly runtimeVersion: number;
}
