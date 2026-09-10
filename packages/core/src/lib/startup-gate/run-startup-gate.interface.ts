/**
 * Contract shapes for `./run-startup-gate`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `run-startup-gate.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `run-startup-gate.ts`, so no import site changes.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type {
	IReconcileStartupInput,
	IStartupClock,
	IStartupReconciliationReport,
	IStartupPhase,
} from '../startup-reconciler/index';
import type { IStartupHostFacts } from './environment-seam';
import type { IStartupGovernanceSeam } from '../startup-reconciler/seams.interface';
import type { IStatePortsOpener } from './state-database-seam';

/** The boot's answer about reconciliation. */
export type IStartupGateOutcome =
	| {
			readonly kind: 'not-required';
			readonly reason: string;
	  }
	| {
			readonly kind: 'reconciled';
			readonly reason: string;
			readonly report: IStartupReconciliationReport;
			/** Optional phases with no collaborator bound this boot. */
			readonly notExecutedPhases: readonly IStartupPhase[];
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
	readonly openStatePorts?: IStatePortsOpener | undefined;
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
