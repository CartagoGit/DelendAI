/**
 * Contract shapes for `./reap-leases`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `reap-leases.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `reap-leases.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';

/** What phase 8 produced. */
export interface ILeasePhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: {
		readonly leasesExpired: number;
		readonly claimsReleased: number;
		readonly workUnitsRecoverable: number;
	};
}
