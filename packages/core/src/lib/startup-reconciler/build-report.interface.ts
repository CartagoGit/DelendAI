/**
 * Contract shapes for `./build-report`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `build-report.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `build-report.ts`, so no import site changes.
 */

import type { IStartupPhaseResult, IReconcileMode } from './contracts';
import type { IRepairResolution } from './repair-resolutions.interface';

/** Everything the verdict needs that is not already in the phases. */
export interface IBuildReportInput {
	readonly phases: readonly IStartupPhaseResult[];
	readonly startedAt: number;
	readonly completedAt: number;
	readonly machineId: string;
	readonly mode: IReconcileMode;
	readonly fingerprint: string;
	/**
	 * Human decisions recorded against repair tasks. Absent means none
	 * were read, which is the same as none existing: nothing is resolved.
	 */
	readonly resolutions?: readonly IRepairResolution[] | undefined;
}
