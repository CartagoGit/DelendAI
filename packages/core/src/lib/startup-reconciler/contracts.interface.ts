/**
 * Contract shapes for `./contracts`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `contracts.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `contracts.ts`, so no import site changes.
 */

import type { STARTUP_PHASES, STARTUP_STATUSES } from './contracts.constant';

export type IStartupStatus = (typeof STARTUP_STATUSES)[number];

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
