/**
 * Contract shapes for `./reconcile`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `reconcile.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `reconcile.ts`, so no import site changes.
 */

import type {
	IGovernanceApplyResult,
	IGovernanceDiff,
	IGovernanceVerification,
} from './diff-contracts';
import type {
	IDesiredForgeState,
	IForgeRepositoryRef,
} from './governance-contracts';
import type { IForgeProviderAdapter } from './provider-contracts';

/** Inputs to `reconcileForgeGovernance`. */
export interface IReconcileInput {
	readonly adapter: IForgeProviderAdapter;
	readonly desired: IDesiredForgeState;
	readonly target: IForgeRepositoryRef;
}

/** The full trace of a reconcile, in the order it happened. */
export interface IReconcileResult {
	readonly before: IGovernanceDiff;
	readonly applied: IGovernanceApplyResult;
	/** The post-apply re-read. The ONLY trustworthy verdict. */
	readonly verification: IGovernanceVerification;
}
