/**
 * Contract shapes for `./reconcile-startup`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `reconcile-startup.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `reconcile-startup.ts`, so no import site changes.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	IStartupClock,
	IStartupEnvironmentSeam,
	IStartupForgeSeam,
	IStartupGitSeam,
	IStartupGovernanceSeam,
	IStartupJournalSource,
	IStartupMutex,
} from './seams.interface';
import type { IStateDatabaseSeam } from './state-ports.interface';
import type { IRepairResolutionsSource } from './repair-resolutions.interface';

/** Everything a boot needs. Every collaborator is a seam. */
export interface IReconcileStartupInput {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly environmentSeam: IStartupEnvironmentSeam;
	readonly database: IStateDatabaseSeam;
	readonly git: IStartupGitSeam;
	readonly mutex: IStartupMutex;
	/**
	 * How long a boot waits for another boot's reconciliation to finish
	 * before it stops waiting, and how often it asks. Two servers on one
	 * workspace start together routinely (an editor and a second client).
	 */
	readonly mutexWait?:
		| {
				readonly timeoutMs: number;
				readonly pollMs: number;
				readonly sleep?: ((ms: number) => Promise<void>) | undefined;
		  }
		| undefined;
	readonly clock: IStartupClock;
	readonly forge?: IStartupForgeSeam | undefined;
	readonly journalSource?: IStartupJournalSource | undefined;
	readonly governance?: IStartupGovernanceSeam | undefined;
	/**
	 * Human decisions recorded against repair tasks. Absent means the
	 * boot read none, and a blocker nobody answered keeps blocking.
	 */
	readonly repairResolutions?: IRepairResolutionsSource | undefined;
	/**
	 * False for a diagnose-only run: never create a database, never write
	 * anything. This is what makes "doctor against a workspace that has
	 * no database" a diagnosis instead of a filesystem error.
	 */
	readonly allowCreate?: boolean | undefined;
}
