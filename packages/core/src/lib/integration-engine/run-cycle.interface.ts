/**
 * Contract shapes for `./run-cycle`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `run-cycle.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `run-cycle.ts`, so no import site changes.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IIntegrationCandidate } from './types';

/** One attempt at integrating one candidate. */
export interface IIntegrationCycleRequest {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly candidate: IIntegrationCandidate;
	/** Overrides the injected clock; specs pin it, production omits it. */
	readonly now?: number;
}
