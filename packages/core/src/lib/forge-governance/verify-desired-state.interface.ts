/**
 * Contract shapes for `./verify-desired-state`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `verify-desired-state.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `verify-desired-state.ts`, so no import site changes.
 */

import type { IGovernanceApplyResult } from './diff-contracts';
import type {
	IDesiredForgeState,
	IForgeRepositoryRef,
} from './governance-contracts';
import type { IForgeProviderAdapter } from './provider-contracts';

/** Inputs to `verifyDesiredState`. */
export interface IVerifyInput {
	readonly adapter: IForgeProviderAdapter;
	readonly desired: IDesiredForgeState;
	readonly target: IForgeRepositoryRef;
	/** The apply whose effect is being verified, when there was one. */
	readonly applied?: IGovernanceApplyResult;
}
