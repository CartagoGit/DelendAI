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

import type { IStartupWorkCounters } from './contracts.interface';

export type {
	IStartupStatus,
	IStartupPhase,
	IFindingKind,
	IRepairClass,
	IFindingDetail,
	IStartupFinding,
	IStartupRepairTask,
	IStartupWorkCounters,
	IReconcileMode,
	IStartupPhaseResult,
	IStartupReconciliationReport,
} from './contracts.interface';
export {
	STARTUP_STATUSES,
	STARTUP_PHASES,
	STARTUP_RECONCILER_VERSION,
} from './contracts.constant';

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
