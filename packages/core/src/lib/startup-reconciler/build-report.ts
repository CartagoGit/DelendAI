/**
 * build-report.ts — the verdict, and the only place it is computed.
 *
 * WHY this is separated from the boot sequence: the sequence decides what
 * to LOOK at; this file decides what the result MEANS, and those two
 * concerns fail differently. Keeping the fold here means there is exactly
 * one expression in the codebase that can produce `READY`, and it is a
 * function of the findings — a phase cannot vote itself green, and a
 * caller cannot pass a flag that overrides the blockers. "READY with a
 * silent warning" is unrepresentable rather than merely discouraged.
 *
 * Repair tasks are de-duplicated by their deterministic id here too, so a
 * condition observed by two phases (or by twenty boots) is one piece of
 * generated work.
 */

import {
	addCounters,
	emptyCounters,
	type IStartupPhaseResult,
	type IStartupReconciliationReport,
	type IStartupRepairTask,
	STARTUP_RECONCILER_VERSION,
	type TReconcileMode,
} from './contracts';
import { needsRepairTask, repairTaskFor } from './finding-catalog';

/** Everything the verdict needs that is not already in the phases. */
export interface IBuildReportInput {
	readonly phases: readonly IStartupPhaseResult[];
	readonly startedAt: number;
	readonly completedAt: number;
	readonly machineId: string;
	readonly mode: TReconcileMode;
	readonly fingerprint: string;
}

export const buildStartupReport = (
	input: IBuildReportInput,
): IStartupReconciliationReport => {
	// The verdict is itself a phase in the report, so a reader can see
	// that judgement happened rather than inferring it from a status.
	const phases: readonly IStartupPhaseResult[] = [
		...input.phases,
		{ phase: 'verdict', ran: true, counters: {}, findings: [] },
	];
	const findings = phases.flatMap((phase) => phase.findings);
	const blockers = findings.filter((item) => item.kind === 'blocker');
	const tasks = new Map<string, IStartupRepairTask>();
	for (const item of blockers) {
		if (!needsRepairTask(item.code)) continue;
		const task = repairTaskFor(item);
		tasks.set(task.id, task);
	}
	const counters = phases.reduce(
		(total, phase) => addCounters(total, phase.counters),
		emptyCounters(),
	);
	return {
		status: blockers.length === 0 ? 'READY' : 'DEGRADED',
		reconcilerVersion: STARTUP_RECONCILER_VERSION,
		mode: input.mode,
		startedAt: input.startedAt,
		completedAt: input.completedAt,
		machineId: input.machineId,
		phases,
		findings,
		blockers,
		repairTasks: [...tasks.values()].sort((left, right) =>
			left.id < right.id ? -1 : 1,
		),
		counters,
		mutationsBlocked: blockers.some((item) => item.blocksMutation),
		recoveryRequired: blockers.some((item) => item.recoveryRequired),
		fingerprint: input.fingerprint,
	};
};
