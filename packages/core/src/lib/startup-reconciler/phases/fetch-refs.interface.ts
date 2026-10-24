/**
 * Contract shapes for `./fetch-refs`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `fetch-refs.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `fetch-refs.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';
import type { IObservedRef } from '../seams.interface';

/** What phase 3 produced. */
export interface IFetchPhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: { readonly gitFetches: number };
	/** The ref name later phases compare work against. */
	readonly integrationRef: string;
	readonly integrationSha: string;
	readonly refs: readonly IObservedRef[];
}
