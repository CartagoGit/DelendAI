/**
 * index.ts — the work-model barrel.
 *
 * WHY a barrel per feature rather than more entries in the package
 * root: the operational work model (repositories, machines, agents,
 * work units, generations, claims, leases, PRs, CI, reconciliation and
 * the coordination journal) is one cohesive surface, and callers
 * should be able to see at a glance which types belong to it.
 *
 * ---------------------------------------------------------------
 * THE DATABASE IS A MATERIALIZED VIEW. IT IS NEVER THE TRANSPORT.
 * ---------------------------------------------------------------
 *
 * `.delendai/state/proposals.sqlite` is git-ignored and MUST NEVER be
 * copied, synced or shared between machines. Every machine holds its
 * own, and a machine that has just cloned the repository starts with
 * nothing. Rebuilding is a first-class path, not a disaster recovery
 * procedure:
 *
 *   1. `new ProposalsSqliteDriver(...)` — migrations create the empty
 *      schema (0015-0017). No work-model row is assumed to exist.
 *   2. `WorkRegistryRepo.registerMachine/registerAgent/registerRepository`
 *      — local identity, plus the repository read from the remote.
 *   3. Walk the forge's refs under the policy's work-ref prefix. Each
 *      `wip/*` ref names a (proposal, slice, generation); `ensure()`
 *      recreates the work unit and `GenerationsRepo.record()` the
 *      checkpoint. Both are keyed on derived identity, so re-walking
 *      converges instead of duplicating.
 *   4. `ForgeRepo.upsertPullRequest` / `upsertCiRun` from the forge's
 *      PR and check APIs, then `attachPullRequest`, `recordValidation`
 *      and `markIntegrated` to reconnect candidates to their verdicts
 *      and merge commits.
 *   5. Replay the exported `coordination_journal` through
 *      `CoordinationJournalRepo.append`. This is the ONLY input that
 *      is not re-derivable from the forge — it carries the semantics
 *      (why ownership moved, what a recovery decided, which
 *      checkpoints were meaningful) that refs and PRs cannot express.
 *      The append is idempotent on a content-derived event id, so a
 *      journal may be replayed any number of times.
 *   6. `WorkReconciliationRepo.start/complete` wraps the sweep so the
 *      rebuild itself leaves an audit trail, including anomalies where
 *      the forge and the journal disagree.
 *
 * What is deliberately NOT rebuildable: live `leases` and `claims`.
 * They describe processes that were running on a machine that no
 * longer exists, and resurrecting them would hand write authority to
 * nobody. A fresh machine starts with no claims and takes new leases.
 */
export {
	canonicalFileScope,
	fileScopeDigest,
	generationUid,
	journalEventId,
	leaseId,
	repositoryUid,
	workUnitUid,
	type IJournalEventIdentity,
	type IRepositoryKey,
} from './ids';
export {
	WorkRegistryRepo,
	type IAgentRecord,
	type IMachineRecord,
	type IRegisterAgentArgs,
	type IRegisterMachineArgs,
	type IRegisterRepositoryArgs,
	type IRepositoryRecord,
	type TAgentState,
} from './registry-repo';
export {
	isLeaseLive,
	LeasesRepo,
	type IAcquireLeaseArgs,
	type ILeaseRecord,
	type TLeaseExpireOutcome,
} from './leases-repo';
export {
	WorkUnitsRepo,
	type IChangeOwnerArgs,
	type ICloseWorkUnitArgs,
	type IEnsureWorkUnitArgs,
	type IOwnershipRecord,
	type IWorkUnitRecord,
	type TCloseWorkUnitOutcome,
	type TOwnershipReason,
	type TWorkUnitState,
} from './work-units-repo';
export {
	GenerationsRepo,
	type IGenerationRecord,
	type IRecordGenerationArgs,
	type TCandidateState,
	type TCheckpointKind,
	type TCiResult,
	type TValidationState,
} from './generations-repo';
export {
	ClaimsRepo,
	type IClaimPathsArgs,
	type IClaimRecord,
	type TClaimOutcome,
} from './claims-repo';
export {
	ForgeRepo,
	type ICiRunRecord,
	type IPullRequestRecord,
	type IUpsertCiRunArgs,
	type IUpsertPullRequestArgs,
	type TCiRunState,
	type TPullRequestState,
} from './forge-repo';
export {
	CoordinationJournalRepo,
	type IAppendCoordinationEventArgs,
	type IAppendCoordinationEventOutcome,
	type ICoordinationEventRecord,
	type TCoordinationEventKind,
} from './journal-repo';
export {
	WorkReconciliationRepo,
	type ICompleteWorkReconciliationArgs,
	type IWorkReconciliationRunRecord,
	type TWorkReconciliationStatus,
} from './reconciliation-repo';
export {
	readGenerationProvenance,
	type IGenerationProvenance,
} from './provenance';
