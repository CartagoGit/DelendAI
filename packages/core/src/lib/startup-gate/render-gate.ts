/**
 * render-gate.ts — turning the verdict into something an operator cannot
 * miss and a report cannot swallow.
 *
 * WHY two renderings and not one: the startup report's warning list is
 * the structured channel (it is machine-readable, it survives into the
 * evidence store, and every host already prints it), while the block
 * below is the human one — a DEGRADED boot has to be legible at a glance
 * in a terminal that has just printed a plugin table. Emitting only the
 * warnings would bury a blocked workspace in a list; emitting only the
 * block would keep the verdict out of the report the audit asked for.
 *
 * WHY repair tasks are printed with their ids: the ids are deterministic,
 * so the same ambiguity produces the same task on every boot. Printing
 * them is what lets an operator (or an agent) tell "still the same
 * problem" from "a new one appeared" without diffing prose.
 */

import type { IStartupReportWarning } from '../startup-report/model';
import type {
	IStartupFinding,
	IStartupReconciliationReport,
	IStartupPhase,
} from '../startup-reconciler/index';
import type { IStartupGateOutcome } from './run-startup-gate';

/** Warning code every reconciliation message carries. */
export const STARTUP_RECONCILIATION_CODE = 'startup-reconciliation';

const phaseList = (phases: readonly IStartupPhase[]): string =>
	phases.length === 0 ? 'none' : phases.join(', ');

const findingLine = (item: IStartupFinding): string =>
	`  - [${item.phase}] ${item.code} (${item.subject}): ${item.message}`;

/**
 * The structured half. A DEGRADED verdict yields one `error` warning per
 * blocker plus a summary, so no caller can render the report and still
 * believe the boot was clean.
 */
export const startupGateWarnings = (
	outcome: IStartupGateOutcome,
): readonly IStartupReportWarning[] => {
	if (outcome.kind === 'not-required') {
		return [
			{
				severity: 'info',
				code: STARTUP_RECONCILIATION_CODE,
				message: `NOT REQUIRED — ${outcome.reason}.`,
			},
		];
	}
	const { report } = outcome;
	const summary: IStartupReportWarning = {
		severity: report.status === 'READY' ? 'info' : 'error',
		code: STARTUP_RECONCILIATION_CODE,
		message: `${report.status} (mode=${report.mode}, machine=${report.machineId}, blockers=${String(report.blockers.length)}, repairTasks=${String(report.repairTasks.length)}); phases NOT EXECUTED: ${phaseList(outcome.notExecutedPhases)}.`,
	};
	return [
		summary,
		...report.blockers.map(
			(item): IStartupReportWarning => ({
				severity: 'error',
				code: `${STARTUP_RECONCILIATION_CODE}.${item.code}`,
				message: `${item.subject}: ${item.message}`,
				source: item.phase,
			}),
		),
		...report.repairTasks.map(
			(task): IStartupReportWarning => ({
				severity: 'warning',
				code: `${STARTUP_RECONCILIATION_CODE}.repair`,
				message: `${task.id} — ${task.title}. Candidate actions: ${task.suggestedActions.join(' | ')}`,
				source: task.phase,
			}),
		),
	];
};

const degradedBlock = (
	report: IStartupReconciliationReport,
	notExecuted: readonly IStartupPhase[],
): readonly string[] => [
	'!! STARTUP RECONCILIATION: DEGRADED !!',
	`The workspace was reconciled and did NOT reach READY (machine=${report.machineId}, mode=${report.mode}).`,
	`Mutations blocked: ${String(report.mutationsBlocked)} | recovery required: ${String(report.recoveryRequired)}`,
	`Phases NOT EXECUTED (no collaborator bound; they did NOT pass): ${phaseList(notExecuted)}`,
	'Blocking findings:',
	...report.blockers.map(findingLine),
	...(report.repairTasks.length === 0
		? []
		: [
				'Generated repair work (ids are stable across boots):',
				...report.repairTasks.map(
					(task) =>
						`  - ${task.id}: ${task.title}\n      actions: ${task.suggestedActions.join(' | ')}`,
				),
			]),
];

/** The human half. Returns the lines; the caller decides where they go. */
export const renderStartupGate = (
	outcome: IStartupGateOutcome,
): readonly string[] => {
	if (outcome.kind === 'not-required') {
		return [`Startup reconciliation NOT REQUIRED — ${outcome.reason}.`];
	}
	const { report } = outcome;
	if (report.status === 'READY') {
		return [
			`Startup reconciliation READY (mode=${report.mode}, machine=${report.machineId}).`,
			`Phases NOT EXECUTED (no collaborator bound; they did NOT pass): ${phaseList(outcome.notExecutedPhases)}`,
		];
	}
	return degradedBlock(report, outcome.notExecutedPhases);
};
