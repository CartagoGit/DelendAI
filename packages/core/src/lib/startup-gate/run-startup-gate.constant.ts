/**
 * Constants for `./run-startup-gate`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `run-startup-gate.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `run-startup-gate.ts`, so no import site changes.
 */

import {
	createStartupGitSeam,
	createStartupMutex,
	type IReconcileStartupInput,
	type IStartupClock,
	type IStartupReconciliationReport,
	reconcileStartup,
	type IStartupPhase,
} from '../startup-reconciler/index';

/**
 * Phases whose collaborator is optional. Naming them here is what lets
 * the report say "NOT EXECUTED" instead of leaving a reader to infer a
 * pass from the absence of findings.
 */
export const OPTIONAL_STARTUP_PHASES = [
	'forge',
	'journal',
	'governance',
] as const satisfies readonly IStartupPhase[];
