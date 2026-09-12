/**
 * Contract shapes for `./open-state`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `open-state.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `open-state.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';
import type {
	IStartupEnvironment,
	IStartupRepositoryKey,
} from '../seams.interface';
import type {
	IStartupStatePorts,
	IStateDatabaseSeam,
} from '../state-ports.interface';

/** What phase 2 produced. */
export interface IStatePhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: {
		readonly migrationsApplied: number;
		readonly projectionsRebuilt: number;
	};
	readonly ports?: IStartupStatePorts | undefined;
	readonly repositoryId?: number | undefined;
	readonly schemaVersion: number;
	readonly ok: boolean;
}

export interface IStatePhaseInput {
	readonly database: IStateDatabaseSeam;
	readonly environment: IStartupEnvironment;
	readonly repository: IStartupRepositoryKey;
	readonly integrationBranch: string;
	readonly releaseBranch: string;
	/** False for a diagnose-only run: never bring a database into being. */
	readonly allowCreate: boolean;
	readonly now: number;
}
