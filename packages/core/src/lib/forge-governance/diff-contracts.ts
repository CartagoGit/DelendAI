/**
 * diff-contracts.ts — the result shapes the broker's three read/write
 * operations return.
 *
 * They live apart from `governance-contracts.ts` because those describe
 * what we WANT and these describe what we FOUND, and the two must never
 * be conflated: a desired value is derived from policy and is always
 * known, while a live value may legitimately be missing — which is the
 * whole reason `status` is a tri-state and `live` is optional.
 *
 * No result type in this file has a field that can carry a credential:
 * `detail` and `reason` are always passed through `safeProviderMessage`
 * before they are populated.
 */

import type { IGovernanceStatus } from './governance-contracts';

export type {
	IGovernancePropertyDiff,
	IGovernanceDiff,
	IGovernanceApplyAction,
	IGovernanceApplyResult,
	IGovernanceVerification,
} from './diff-contracts.interface';

/** The one place a verdict is turned into a boolean gate. */
export const isPassingVerdict = (verdict: IGovernanceStatus): boolean =>
	verdict === 'PASS';
