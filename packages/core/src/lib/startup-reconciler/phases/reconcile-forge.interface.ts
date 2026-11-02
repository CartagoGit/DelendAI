/**
 * Contract shapes for `./reconcile-forge`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `reconcile-forge.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `reconcile-forge.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';

/** What phase 5 produced. */
export interface IForgePhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: {
		readonly forgeRequests: number;
		readonly pullRequestsReconciled: number;
		readonly ciRunsReconciled: number;
		readonly generationsIntegrated: number;
	};
	/** The ETag to carry into the next boot's fingerprint. */
	readonly etag: string;
}
