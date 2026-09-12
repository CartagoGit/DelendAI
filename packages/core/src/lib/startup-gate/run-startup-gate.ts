/**
 * run-startup-gate.ts — the boot-time call site of the reconciler.
 *
 * WHY this module exists rather than a few lines in the host script: the
 * contract the audit stated is "NO reconciliation → NO READY", and a
 * contract that lives in one executable script is a contract exactly one
 * host honours. Assembling the seams, consulting the policy gate and
 * producing a verdict is host-independent behaviour, so it lives in core
 * where every host — the repo's own MCP entrypoint, the CLI doctor, a
 * downstream adopter's server — reaches the same answer.
 *
 * WHY the outcome is a value and not a thrown error: an operator whose
 * workspace is DEGRADED needs the server to come up so they can ask it
 * what is wrong. Aborting the boot would hide the report behind the very
 * failure it describes. The verdict is therefore loud, honest and
 * non-fatal by default; `strict` exists for a supervised deployment that
 * would rather not serve at all, and defaults to OFF for that reason.
 */

import {
	createStartupGitSeam,
	createStartupMutex,
	type IStartupClock,
	reconcileStartup,
} from '../startup-reconciler/index';
import { createStartupEnvironmentSeam } from './environment-seam';
import {
	decideStartupReconciliation,
	type IStartupReconciliationGate,
} from './policy-gate';
import { createStateDatabaseSeam } from './state-database-seam';

import type {
	IStartupGateOutcome,
	IRunStartupGateInput,
} from './run-startup-gate.interface';
import { OPTIONAL_STARTUP_PHASES } from './run-startup-gate.constant';

export type {
	IStartupGateOutcome,
	IRunStartupGateInput,
} from './run-startup-gate.interface';
export { OPTIONAL_STARTUP_PHASES } from './run-startup-gate.constant';

const systemClock: IStartupClock = { now: () => Date.now() };

/**
 * Consult the policy, and reconcile when it calls for it. Never throws
 * for an expected condition — a missing database, an offline forge or a
 * busy peer all come back inside the outcome.
 */
export const runStartupGate = async (
	input: IRunStartupGateInput,
): Promise<IStartupGateOutcome> => {
	const gate: IStartupReconciliationGate = decideStartupReconciliation(
		input.policy,
	);
	if (!gate.required) {
		return { kind: 'not-required', reason: gate.reason };
	}

	const clock = input.clock ?? systemClock;
	const environmentSeam = createStartupEnvironmentSeam({
		workspaceRoot: input.workspaceRoot,
		git: input.git,
		agentId: input.agentId,
		...(input.hostFacts === undefined
			? {}
			: { hostFacts: input.hostFacts }),
	});
	const environment = await environmentSeam.detect();
	const database = await createStateDatabaseSeam({
		databasePath: input.databasePath,
		...(input.openStatePorts === undefined
			? {}
			: { openPorts: input.openStatePorts }),
	});
	const reconcile = input.reconcile ?? reconcileStartup;
	const report = await reconcile({
		policy: input.policy,
		environmentSeam,
		database,
		git: createStartupGitSeam(input.git),
		mutex: createStartupMutex({
			path: input.lockPath,
			machineId: environment.machineId,
			clock,
		}),
		clock,
		...(input.governance === undefined
			? {}
			: { governance: input.governance }),
		...(input.allowCreate === undefined
			? {}
			: { allowCreate: input.allowCreate }),
	});

	return {
		kind: 'reconciled',
		reason: gate.reason,
		report,
		// Only the collaborators that were actually left unbound are
		// reported NOT EXECUTED. Listing a phase that DID run would be
		// the same lie as implying a green one that did not.
		notExecutedPhases: OPTIONAL_STARTUP_PHASES.filter(
			(phase) => phase !== 'governance' || input.governance === undefined,
		),
	};
};
