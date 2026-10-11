import type { IStateSqliteMigration } from '../interfaces/state-sqlite-migration.interface';
import { CREATE_GENERATIONS_TABLE_SQL } from '../../schema';

/**
 * The oldest `user_version` this driver can bring forward. A store at or
 * above it and below `STATE_SQLITE_SCHEMA_VERSION` is migrated on open;
 * anything newer than the current version is refused (fail closed).
 */
export const STATE_SQLITE_OLDEST_MIGRATABLE_SCHEMA_VERSION = 1;

/**
 * Ordered steps from `STATE_SQLITE_OLDEST_MIGRATABLE_SCHEMA_VERSION` up to
 * `STATE_SQLITE_SCHEMA_VERSION`, applied in one transaction on open. A row
 * the step cannot carry (a v1 snapshot without `generation.id`) violates
 * NOT NULL and aborts the whole migration: the store stays at v1 and the
 * driver refuses it rather than inventing an id.
 */
export const STATE_SQLITE_MIGRATIONS: readonly IStateSqliteMigration[] = [
	{
		// v1 -> v2: `fingerprint` stops being UNIQUE and each row is keyed by
		// its generation. The old table moves aside (its index goes with it
		// and is dropped with it); the current DDL recreates `generations`.
		from: 1,
		statements: [
			'ALTER TABLE generations RENAME TO generations_v1;',
			CREATE_GENERATIONS_TABLE_SQL,
			`INSERT INTO generations (
				id, scope_kind, scope_locator_json, generation_id, snapshot_json,
				fingerprint, reconciled_commit_sha, schema_version, created_at, updated_at
			)
			SELECT
				id, scope_kind, scope_locator_json, json_extract(snapshot_json, '$.generation.id'),
				snapshot_json, fingerprint, reconciled_commit_sha, 2, created_at, updated_at
			FROM generations_v1;`,
			'DROP TABLE generations_v1;',
		],
	},
];
