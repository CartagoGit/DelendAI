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
export {
	ProposalRepo,
	type IProposalRecord,
	type IUpsertProposalProjectionOutcome,
	type TCloseProposalOutcome,
	type ICloseProposalArgs,
} from './lib/repository/proposals-repo';
export {
	PlanRepo,
	type IPlanRecord,
	type ICreatePlanArgs,
	type ITransitionPlanArgs,
	type TTransitionPlanOutcome,
	type TClosePlanOutcome,
	type TPlanStatus,
} from './lib/repository/plans-repo';
export {
	SliceRepo,
	type ISliceRecord,
	type ICreateSliceArgs,
	type ITransitionSliceArgs,
	type TTransitionSliceOutcome,
	type TCloseSliceOutcome,
	type TSliceStatus,
} from './lib/repository/slices-repo';
export {
	digestProposalCandidates,
	canonicalProposalCandidates,
} from './lib/repository/digest';
export {
	reconcileShadowToStaging,
	type IShadowReconcileInput,
	type IShadowReconcileResult,
	type IIntegrityCheckResult,
	type IForeignKeyCheckResult,
	type IForeignKeyViolation,
} from './lib/reconciler-staging';
export {
	reconcile,
	reconcileProposalMarkdown,
	type IMarkdownReconcileInput,
	type IProposalCandidate,
	type IQuarantineCandidate,
	type IReconcileInput,
	type IReconcileResult,
	type IReconcilerInputFile,
	type TReconcileOutput,
} from './lib/reconciler';
export {
	QuarantineRepo,
	type IQuarantineRecord,
	type IRecordQuarantineArgs,
	type IResolveQuarantineArgs,
	type TQuarantineStatus,
} from './lib/repository/quarantine-repo';
