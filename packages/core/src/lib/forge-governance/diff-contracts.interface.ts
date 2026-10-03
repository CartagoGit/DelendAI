/**
 * Contract shapes for `./diff-contracts`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `diff-contracts.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `diff-contracts.ts`, so no import site changes.
 */

import type {
	IBranchProperty,
	IForgeProviderId,
	IGovernanceScope,
	IGovernanceStatus,
	IGovernanceValue,
	IForgeRepositoryRef,
	IRepositoryProperty,
} from './governance-contracts';

/** One governed property, compared. */
export interface IGovernancePropertyDiff {
	readonly id: string;
	readonly scope: IGovernanceScope;
	/** Present for branch-scoped properties only. */
	readonly branch?: string;
	readonly property: IBranchProperty | IRepositoryProperty;
	readonly desired: IGovernanceValue;
	/** Absent exactly when `status` is `NOT_EXECUTABLE`. */
	readonly live?: IGovernanceValue;
	readonly status: IGovernanceStatus;
	/**
	 * False only when the policy explicitly declared the property
	 * not-applicable. An unreadable property is applicable and
	 * `NOT_EXECUTABLE`; it is never quietly excluded.
	 */
	readonly applicable: boolean;
	/** Redacted, human-readable explanation. */
	readonly detail: string;
}

/** The structured diff `inspectDesiredVsLive` returns. */
export interface IGovernanceDiff {
	readonly provider: IForgeProviderId;
	readonly target: IForgeRepositoryRef;
	readonly policyProfile: string;
	readonly properties: readonly IGovernancePropertyDiff[];
	/**
	 * `FAIL` when any applicable property mismatches; else
	 * `NOT_EXECUTABLE` when any applicable property could not be read;
	 * else `PASS`. An unreadable property can never produce `PASS`.
	 */
	readonly verdict: IGovernanceStatus;
	readonly failing: readonly string[];
	readonly notExecutable: readonly string[];
	readonly notApplicable: readonly string[];
	readonly failClosedOnUnverifiable: boolean;
}

/** One write the broker attempted. */
export interface IGovernanceApplyAction {
	readonly scope: IGovernanceScope;
	/** Present for branch writes. */
	readonly branch?: string;
	readonly ok: boolean;
	/** Property ids this write was meant to reconcile. */
	readonly properties: readonly string[];
	/** Redacted. Empty when `ok`. */
	readonly reason: string;
}

/** What `applyDesiredState` returns. It does NOT claim verification. */
export interface IGovernanceApplyResult {
	readonly provider: IForgeProviderId;
	readonly target: IForgeRepositoryRef;
	/** False when the policy is `observed`, or the adapter forbids writes. */
	readonly attempted: boolean;
	readonly actions: readonly IGovernanceApplyAction[];
	/** Redacted explanation when nothing was attempted. */
	readonly skippedReason: string;
}

/**
 * What `verifyDesiredState` returns: the post-apply RE-READ. `verdict`
 * here is the only thing a gate may trust — an apply that succeeded but
 * whose effect cannot be read back is `NOT_EXECUTABLE`, not `PASS`.
 */
export interface IGovernanceVerification {
	readonly verdict: IGovernanceStatus;
	readonly passed: boolean;
	readonly diff: IGovernanceDiff;
	/** Applied but read back differently — the "forge lied" case. */
	readonly regressions: readonly string[];
}
