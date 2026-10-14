/**
 * Contract shapes for `./inspect-governance`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `inspect-governance.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `inspect-governance.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';

/** What phase 10 produced. */
export interface IGovernancePhaseResult {
	readonly findings: readonly IStartupFinding[];
}
