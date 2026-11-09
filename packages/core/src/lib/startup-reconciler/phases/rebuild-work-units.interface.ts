/**
 * Contract shapes for `./rebuild-work-units`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `rebuild-work-units.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `rebuild-work-units.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';
import type {
	IObservedRef,
	IStartupGitSeam,
	IStartupRepositoryKey,
	IWorkRefSnapshot,
} from '../seams.interface';
import type { IStartupStatePorts } from '../state-ports.interface';
import type { IWorkRefParser } from '../work-ref-identity';

/** A ref the boot successfully tied back to a work unit. */
export interface IRebuiltRef {
	readonly ref: string;
	readonly sha: string;
	readonly workUnitId: number;
	readonly workUnitUid: string;
	readonly generation: number;
	readonly snapshot?: IWorkRefSnapshot | undefined;
}

/** What phase 4 produced. */
export interface IWorkRefPhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: {
		readonly refsExamined: number;
		readonly refsSkippedUnchanged: number;
		readonly workUnitsRebuilt: number;
		readonly generationsRecorded: number;
	};
	readonly rebuilt: readonly IRebuiltRef[];
}

export interface IWorkRefPhaseInput {
	readonly ports: IStartupStatePorts;
	readonly git: IStartupGitSeam;
	readonly parser: IWorkRefParser | undefined;
	readonly refs: readonly IObservedRef[];
	readonly repository: IStartupRepositoryKey;
	readonly repositoryId: number;
	readonly integrationRef: string;
	readonly integrationSha: string;
	readonly agentId: string;
	readonly machineId: string;
	readonly mode: 'full' | 'incremental';
	/** Ref SHAs the previous run on this machine already examined. */
	readonly previousRefs: Readonly<Record<string, string>>;
	readonly now: number;
}
