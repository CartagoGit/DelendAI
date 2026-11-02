/**
 * Contract shapes for `./integration-evidence`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `integration-evidence.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `integration-evidence.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';

/** What phase 7 produced. */
export interface IIntegrationPhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: { readonly generationsIntegrated: number };
}
