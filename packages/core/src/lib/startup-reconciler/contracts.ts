/**
 * contracts.ts — the vocabulary of a startup reconciliation.
 *
 * WHY this file exists: "the MCP starts and everything is reconstructed"
 * is only trustworthy if the reconstruction is describable. A boolean
 * `ready` cannot say WHICH phase ran, WHAT it repaired, what it refused
 * to touch, or why the server is allowed to serve. So every run produces
 * a report made of typed findings, and READY is a *derived* verdict over
 * those findings rather than a flag somebody remembered to clear.
 *
 * Two rules are encoded in the shapes here and nowhere else:
 *
 *   1. There is no "READY with a warning". A finding that is a blocker
 *      makes the verdict DEGRADED; there is no field a caller can set to
 *      say "ready anyway".
 *   2. Anything the reconciler could not resolve deterministically
 *      becomes a STRUCTURED repair task with a deterministic id, so the
 *      system generates the follow-up work instead of asking a human to
 *      run fifteen commands — and so twenty startups generate the SAME
 *      task, not twenty of them.
 */

/** The two states a boot may end in. There is deliberately no third. */
export const STARTUP_STATUSES = ['READY', 'DEGRADED'] as const;
export type IStartupStatus = (typeof STARTUP_STATUSES)[number];

/**
 * The phases, in execution order. Exported as data because the report
 * lists them and the tests assert the order — a phase that silently
 * stopped running would otherwise be invisible.
 */
export const STARTUP_PHASES = [
	'mutex',
	'environment',
	'state-database',
	'fetch',
	'work-refs',
	'forge',
	'journal',
	'integration-evidence',
	'leases',
	'checkout',
	'governance',
	'verdict',
] as const;
export type IStartupPhase = (typeof STARTUP_PHASES)[number];

/**
 * How a finding relates to the run:
 *   - `repaired` — a SAFE repair that was applied automatically.
 *   - `blocker`  — the run may not declare READY.
 *   - `note`     — observed, benign, kept for the audit trail.
 */
export type IFindingKind = 'repaired' | 'blocker' | 'note';

/**
 * SAFE vs AMBIGUOUS. The whole fail-closed posture is this one field:
 * `safe` findings may be acted on without asking, `ambiguous` ones never
 * are — they are reported, they block, and they generate repair work.
 */
export type IRepairClass = 'safe' | 'ambiguous';

/** Machine-readable detail. Deliberately not `unknown`: a report is data. */
export type IFindingDetail = Readonly<
	Record<string, string | number | boolean>
>;

/** One thing the reconciler observed. */
export interface IStartupFinding {
	/** Stable id, e.g. `work-refs.duplicate-generation`. */
	readonly code: string;
	readonly phase: IStartupPhase;
	readonly kind: IFindingKind;
	readonly repairClass: IRepairClass;
	/** What it is about: a ref, a work unit uid, a path, a branch. */
	readonly subject: string;
	readonly message: string;
	/** True when further dangerous mutation must be refused. */
	readonly blocksMutation: boolean;
	/** True when a human/agent-driven recovery is required. */
	readonly recoveryRequired: boolean;
	readonly detail?: IFindingDetail | undefined;
}

/**
 * The work the system generates for itself when it refuses to improvise.
 * `id` is derived from `code` + `subject`, so re-observing the same
 * ambiguity on the next boot yields the same task id.
 */
export interface IStartupRepairTask {
	readonly id: string;
	readonly code: string;
	readonly phase: IStartupPhase;
	readonly subject: string;
	readonly title: string;
	readonly evidence: readonly string[];
	/** Candidate actions. NEVER executed by the reconciler. */
	readonly suggestedActions: readonly string[];
	readonly blocksMutation: boolean;
}

/**
 * How much work this boot did. These are the numbers the efficiency and
 * idempotency tests assert on: a warm machine must move most of them to
 * zero, and a repeated boot must not grow the "created" ones.
 */
export interface IStartupWorkCounters {
	readonly gitFetches: number;
	readonly forgeRequests: number;
	readonly refsExamined: number;
	readonly refsSkippedUnchanged: number;
	readonly workUnitsRebuilt: number;
	readonly generationsRecorded: number;
	readonly generationsIntegrated: number;
	readonly pullRequestsReconciled: number;
	readonly ciRunsReconciled: number;
	readonly journalEventsImported: number;
	readonly journalEventsSkipped: number;
	readonly leasesExpired: number;
	readonly claimsReleased: number;
	readonly workUnitsRecoverable: number;
	readonly migrationsApplied: number;
	readonly projectionsRebuilt: number;
}

/** All counters at zero — the identity element phases fold onto. */
export const emptyCounters = (): IStartupWorkCounters => ({
	gitFetches: 0,
	forgeRequests: 0,
	refsExamined: 0,
	refsSkippedUnchanged: 0,
	workUnitsRebuilt: 0,
	generationsRecorded: 0,
	generationsIntegrated: 0,
	pullRequestsReconciled: 0,
	ciRunsReconciled: 0,
	journalEventsImported: 0,
	journalEventsSkipped: 0,
	leasesExpired: 0,
	claimsReleased: 0,
	workUnitsRecoverable: 0,
	migrationsApplied: 0,
	projectionsRebuilt: 0,
});

/**
 * Adds two counter sets. Written out key by key on purpose: a spread-and-
 * cast version would keep compiling after a counter is added and quietly
 * stop summing it, which is exactly the failure the efficiency tests are
 * supposed to catch.
 */
export const addCounters = (
	left: IStartupWorkCounters,
	right: Partial<IStartupWorkCounters>,
): IStartupWorkCounters => ({
	gitFetches: left.gitFetches + (right.gitFetches ?? 0),
	forgeRequests: left.forgeRequests + (right.forgeRequests ?? 0),
	refsExamined: left.refsExamined + (right.refsExamined ?? 0),
	refsSkippedUnchanged:
		left.refsSkippedUnchanged + (right.refsSkippedUnchanged ?? 0),
	workUnitsRebuilt: left.workUnitsRebuilt + (right.workUnitsRebuilt ?? 0),
	generationsRecorded:
		left.generationsRecorded + (right.generationsRecorded ?? 0),
	generationsIntegrated:
		left.generationsIntegrated + (right.generationsIntegrated ?? 0),
	pullRequestsReconciled:
		left.pullRequestsReconciled + (right.pullRequestsReconciled ?? 0),
	ciRunsReconciled: left.ciRunsReconciled + (right.ciRunsReconciled ?? 0),
	journalEventsImported:
		left.journalEventsImported + (right.journalEventsImported ?? 0),
	journalEventsSkipped:
		left.journalEventsSkipped + (right.journalEventsSkipped ?? 0),
	leasesExpired: left.leasesExpired + (right.leasesExpired ?? 0),
	claimsReleased: left.claimsReleased + (right.claimsReleased ?? 0),
	workUnitsRecoverable:
		left.workUnitsRecoverable + (right.workUnitsRecoverable ?? 0),
	migrationsApplied: left.migrationsApplied + (right.migrationsApplied ?? 0),
	projectionsRebuilt:
		left.projectionsRebuilt + (right.projectionsRebuilt ?? 0),
});

/**
 * `full` rebuilds from every ref and every forge page (a fresh machine);
 * `incremental` trusts the previous run's fingerprint and only looks at
 * what changed; `skipped` means a phase did not run at all (no policy
 * for it, or an earlier phase blocked it).
 */
export type IReconcileMode = 'full' | 'incremental' | 'skipped';

/** What one phase did. */
export interface IStartupPhaseResult {
	readonly phase: IStartupPhase;
	readonly ran: boolean;
	readonly findings: readonly IStartupFinding[];
	readonly counters: Partial<IStartupWorkCounters>;
}

/** The complete outcome of a boot-time reconciliation. */
export interface IStartupReconciliationReport {
	readonly status: IStartupStatus;
	/** Version of the reconciliation algorithm itself. */
	readonly reconcilerVersion: number;
	readonly mode: IReconcileMode;
	readonly startedAt: number;
	readonly completedAt: number;
	readonly machineId: string;
	readonly phases: readonly IStartupPhaseResult[];
	readonly findings: readonly IStartupFinding[];
	/** The subset of findings that forbid READY. */
	readonly blockers: readonly IStartupFinding[];
	readonly repairTasks: readonly IStartupRepairTask[];
	readonly counters: IStartupWorkCounters;
	/** True when the runtime must refuse further dangerous mutation. */
	readonly mutationsBlocked: boolean;
	readonly recoveryRequired: boolean;
	/** The fingerprint this run ended with; the next boot compares it. */
	readonly fingerprint: string;
}

/** Current `IStartupReconciliationReport.reconcilerVersion`. */
export const STARTUP_RECONCILER_VERSION = 1;
