/**
 * f00127 — public surface for plugin authors / tests.
 *
 * Re-exports the eval-harness types and the S2 scoring surface so
 * plugin consumers can build alternative harnesses (e.g. batch eval
 * over a fixture suite) and alternative scorers (e.g. per-taskType
 * dashboards) without duplicating the contracts.
 */
export type {
	IEvalAttempt,
	IEvalHarnessDeps,
	IEvalHarnessInput,
	IEvalHarnessResult,
	IEvalProvider,
	IProviderRunResult,
} from '../lib/eval/eval-harness';
export { runEvalHarness } from '../lib/eval/eval-harness';

// S2 — scoring + report
export type {
	IAttemptWithTask,
	IProviderScore,
	IRankedReport,
	TaskType,
} from '../lib/score/score';
export {
	scoreProvider,
	scoreReport,
	scorePerTaskType,
} from '../lib/score/score';
export { buildEvalReportToolRegistration } from '../lib/tools/eval-report.tool';
export type { IEvalReportToolOptions } from '../lib/tools/eval-report.tool';
