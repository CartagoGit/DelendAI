/**
 * Contract shapes for `./apply-desired-state`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `apply-desired-state.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `apply-desired-state.ts`, so no import site changes.
 */

import type { IGovernanceDiff } from './diff-contracts';
import type {
	IDesiredForgeState,
	IForgeRepositoryRef,
} from './governance-contracts';
import type { IForgeProviderAdapter } from './provider-contracts';

/** Inputs to `applyDesiredState`. */
export interface IApplyInput {
	readonly adapter: IForgeProviderAdapter;
	readonly desired: IDesiredForgeState;
	readonly target: IForgeRepositoryRef;
	/**
	 * The diff to reconcile. When omitted every governed target is
	 * written — used for a first-time bootstrap where nothing was
	 * readable and therefore nothing could be diffed.
	 */
	readonly diff?: IGovernanceDiff;
}
