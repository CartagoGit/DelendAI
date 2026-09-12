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

/** Everything a boot needs. Every collaborator is a seam. */
export interface IReconcileStartupInput {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly environmentSeam: IStartupEnvironmentSeam;
	readonly database: IStateDatabaseSeam;
	readonly git: IStartupGitSeam;
	readonly mutex: IStartupMutex;
	readonly clock: IStartupClock;
	readonly forge?: IStartupForgeSeam | undefined;
	readonly journalSource?: IStartupJournalSource | undefined;
	readonly governance?: IStartupGovernanceSeam | undefined;
	/**
	 * False for a diagnose-only run: never create a database, never write
	 * anything. This is what makes "doctor against a workspace that has
	 * no database" a diagnosis instead of a filesystem error.
	 */
	readonly allowCreate?: boolean | undefined;
}
