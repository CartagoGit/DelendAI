/**
 * index.ts — the startup reconciler's public surface.
 *
 * One entry point (`reconcileStartup`), the contracts a caller needs to
 * read its report, the seams a caller must supply, and two concrete
 * implementations that are not worth reinventing per host (the real git
 * seam and the filesystem mutex). Everything else — the phases — stays
 * internal, because a caller that could run one phase on its own could
 * declare READY without the others.
 */

export {
	addCounters,
	emptyCounters,
	type IStartupFinding,
	type IStartupPhaseResult,
	type IStartupReconciliationReport,
	type IStartupRepairTask,
	type IStartupWorkCounters,
	STARTUP_PHASES,
	STARTUP_RECONCILER_VERSION,
	STARTUP_STATUSES,
	type IFindingKind,
	type IReconcileMode,
	type IRepairClass,
	type IStartupPhase,
	type IStartupStatus,
} from './contracts';
export {
	AMBIGUOUS_FINDING_CODES,
	classifyFinding,
	isRegisteredSafeRepair,
	needsRepairTask,
	repairTaskId,
	SAFE_FINDING_CODES,
	UNVERIFIED_FINDING_CODES,
} from './finding-catalog';
export { createStartupGitSeam } from './git-seam';
export {
	createStartupMutex,
	type IStartupMutexOptions,
	STARTUP_LOCK_TTL_MS,
} from './startup-mutex';
export {
	computeFingerprint,
	type IPreviousRun,
	policyDigest,
	readPreviousRun,
	refInventoryDigest,
} from './fingerprint';
export {
	type IReconcileStartupInput,
	reconcileStartup,
} from './reconcile-startup';
export type {
	IForgeCheckRun,
	IForgePullRequest,
	IGitOutcome,
	IJournalSourceEvent,
	IObservedRef,
	IStartupClock,
	IStartupEnvironment,
	IStartupEnvironmentSeam,
	IStartupForgeSeam,
	IStartupGitSeam,
	IStartupGovernanceSeam,
	IStartupJournalSource,
	IStartupMutex,
	IStartupRepositoryKey,
	IWorkRefSnapshot,
	IForgeRead,
	IMutexOutcome,
} from './seams.interface';
export type {
	IClaimView,
	IGenerationView,
	ILeaseView,
	IStartupClaimsPort,
	IStartupForgePort,
	IStartupGenerationsPort,
	IStartupJournalPort,
	IStartupLeasesPort,
	IStartupReconciliationPort,
	IStartupRegistryPort,
	IStartupSchemaPort,
	IStartupStatePorts,
	IStartupWorkUnitsPort,
	IStateDatabaseSeam,
	IWorkUnitView,
	IStateDatabaseProbe,
} from './state-ports.interface';
export {
	compileWorkRefParser,
	type IWorkRefIdentity,
	type IWorkRefParser,
	qualifyRef,
	workRefNamespace,
} from './work-ref-identity';
