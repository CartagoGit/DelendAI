/**
 * Contract shapes for `./detect-environment`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `detect-environment.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `detect-environment.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';
import type { IStartupEnvironment } from '../seams.interface';

/** What phase 1 produced. */
export interface IEnvironmentPhaseResult {
	readonly environment: IStartupEnvironment;
	readonly findings: readonly IStartupFinding[];
	/** False when later phases must not run. */
	readonly ok: boolean;
}
