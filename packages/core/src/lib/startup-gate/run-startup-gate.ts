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

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import {
	createStartupGitSeam,
	createStartupMutex,
	type IReconcileStartupInput,
	type IStartupClock,
	type IStartupReconciliationReport,
	reconcileStartup,
	type TStartupPhase,
} from '../startup-reconciler/index';
import {
	createStartupEnvironmentSeam,
	type IStartupHostFacts,
} from './environment-seam';
import type { IStartupGovernanceSeam } from '../startup-reconciler/seams';
import {
	decideStartupReconciliation,
	type IStartupReconciliationGate,
} from './policy-gate';
import {
	createStateDatabaseSeam,
	type TStatePortsOpener,
} from './state-database-seam';

/**
 * Phases whose collaborator is optional. Naming them here is what lets
 * the report say "NOT EXECUTED" instead of leaving a reader to infer a
 * pass from the absence of findings.
 */
export const OPTIONAL_STARTUP_PHASES = [
	'forge',
	'journal',
	'governance',
] as const satisfies readonly TStartupPhase[];

/** The boot's answer about reconciliation. */
export type TStartupGateOutcome =
	| {
			readonly kind: 'not-required';
			readonly reason: string;
	  }
	| {
			readonly kind: 'reconciled';
			readonly reason: string;
			readonly report: IStartupReconciliationReport;
			/** Optional phases with no collaborator bound this boot. */
			readonly notExecutedPhases: readonly TStartupPhase[];
	  };

export interface IRunStartupGateInput {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly workspaceRoot: string;
	/** Identity this process reconciles as. */
	readonly agentId: string;
	/** Absolute path of the cross-process startup lock file. */
	readonly lockPath: string;
	/** Absolute path of the operational state database. */
	readonly databasePath: string;
	readonly git: IGitRunner;
	readonly openStatePorts?: TStatePortsOpener | undefined;
	/**
	 * Read-only governance reader. Absent means the boot inspects no
	 * forge at all and the governance phase reports NOT EXECUTED — which
	 * is the honest answer for a host that was given no way to look.
	 */
	readonly governance?: IStartupGovernanceSeam | undefined;
	readonly clock?: IStartupClock | undefined;
	readonly hostFacts?: IStartupHostFacts | undefined;
	/** False for a diagnose-only run: never bring a database into being. */
	readonly allowCreate?: boolean | undefined;
	/**
	 * Injected so a spec can prove the boot path reaches the reconciler
	 * without standing up a repository, a database and a forge.
	 */
	readonly reconcile?:
		| ((
				input: IReconcileStartupInput,
		  ) => Promise<IStartupReconciliationReport>)
		| undefined;
}

const systemClock: IStartupClock = { now: () => Date.now() };

/**
 * Consult the policy, and reconcile when it calls for it. Never throws
 * for an expected condition — a missing database, an offline forge or a
 * busy peer all come back inside the outcome.
 */
export const runStartupGate = async (
	input: IRunStartupGateInput,
): Promise<TStartupGateOutcome> => {
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
