/**
 * Contract shapes for `./verify-checkout`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `verify-checkout.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `verify-checkout.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';

/** What phase 9 produced. */
export interface ICheckoutPhaseResult {
	readonly findings: readonly IStartupFinding[];
}
