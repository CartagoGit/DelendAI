/**
 * index.ts — q00022 S1.
 *
 * Root of `@delendai/proposals-sqlite`. The package is intentionally
 * small: the schema lives in `./lib/migrations/*.sql`, the driver in
 * `./lib/sqlite-driver.ts`, and the rest of the lifecycle / outbox /
 * quarantine surface lands in later slices (q00022 S2-S5).
 */
export {
	resolveProposalsDbPaths,
	PROPOSALS_DB_FILENAME,
	PROPOSALS_DB_STAGING_FILENAME,
	PROPOSALS_STATE_DIR_SEGMENTS,
	type IProposalsDbPaths,
	type IResolveProposalsDbPathsOptions,
} from './lib/db-path';
export {
	ProposalsSqliteDriver,
	type IProposalsSqliteDriverOptions,
} from './lib/sqlite-driver';
export {
	SQLITE_BOOT_PRAGMAS,
	PROPOSALS_SQLITE_SCHEMA_VERSION,
} from './lib/schema';
export {
	LIFECYCLE_STATUS_VOCABULARY,
	LIFECYCLE_STATUS_ALIASES,
	PROPOSAL_KIND_VOCABULARY,
	PROPOSAL_KIND_ALIASES,
	VocabularyViolationError,
	isLifecycleStatus,
	isProposalKind,
	normalizeLifecycleStatus,
	normalizeProposalKind,
	readColumnVocabularyFromMigrations,
	type TLifecycleStatus,
	type TProposalKind,
} from './lib/vocabulary';
export {
	applyMigrations,
	readMigrationSource,
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
	OutboxProcessor,
	type IOutboxProcessorOptions,
	type IOutboxTickResult,
	type TOutboxHandler,
} from './lib/outbox/processor';
export {
	createRegenerateIndexHandler,
	type IRegenerateIndexHandlerOptions,
} from './lib/outbox/handlers/regenerate-index';
export {
	createNotifyAgentHandler,
	type INotifyAgentHandlerOptions,
} from './lib/outbox/handlers/notify-agent';
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
	canonicalPlanCandidates,
	canonicalSliceCandidates,
	digestEntityCandidates,
	type IMarkdownReconcileInput,
	type IPlanCandidate,
	type IProposalCandidate,
	type IQuarantineCandidate,
	type IReconcileInput,
	type IReconcileResult,
	type IReconcilerInputFile,
	type ISliceCandidate,
	type TReconcileOutput,
} from './lib/reconciler';
export {
	applyValidatedCandidate,
	type IApplyValidatedCandidateInput,
	type IApplyValidatedCandidateResult,
} from './lib/reconciler-apply-candidate';
export {
	QuarantineRepo,
	type IQuarantineRecord,
	type IRecordQuarantineArgs,
	type IResolveQuarantineArgs,
	type TQuarantineStatus,
} from './lib/repository/quarantine-repo';
export {
	SummaryRepo,
	type ISummaryCacheRecord,
} from './lib/repository/summary-repo';
export {
	summaryBackfill,
	type ISummaryBackfillArgs,
	type ISummaryBackfillProposal,
	type ISummaryBackfillResult,
} from './lib/summary/backfill';
