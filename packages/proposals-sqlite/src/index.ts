/**
 * index.ts — q00022 S1.
 *
 * Root of `@delendai/proposals-sqlite`. The package is intentionally
 * small: the schema lives in `./lib/migrations/*.sql`, the driver in
 * `./lib/sqlite-driver.ts`, and the rest of the lifecycle / outbox /
 * quarantine surface lands in later slices (q00022 S2-S5).
 */
export {
	ProposalsSqliteDriver,
	type IProposalsSqliteDriverOptions,
} from './lib/sqlite-driver';
export {
	SQLITE_BOOT_PRAGMAS,
	PROPOSALS_SQLITE_SCHEMA_VERSION,
} from './lib/schema';
export {
	applyMigrations,
	currentSchemaVersion,
	MIGRATION_FILES,
	MIGRATION_CHECKSUMS,
	MigrationChecksumMismatchError,
	type IMigrationApplyOutcome,
} from './lib/migrations';
export {
	LifecycleRepo,
	type ILifecycleEventRecord,
	type IAppendLifecycleEventArgs,
} from './lib/repository/lifecycle-repo';
export {
	OutboxRepo,
	type IOutboxRecord,
	type IEnqueueOutboxArgs,
	type TEnqueueOutboxOutcome,
	type TOutboxStatus,
} from './lib/repository/outbox-repo';
