/**
 * provider-contracts.ts — the narrow, TYPED seam between the governance
 * broker and a forge vendor.
 *
 * It exists so the broker never grows a `request(anything)` escape hatch.
 * The only things an adapter may be asked to do are: read the properties
 * this policy governs, write a branch rule, and write the repository
 * settings. A caller therefore cannot smuggle an arbitrary privileged API
 * call through governance, and a fake adapter in a test is a handful of
 * pure functions rather than an HTTP mock.
 *
 * A live value is deliberately a discriminated union: an adapter that
 * cannot read a property must say so, and has no way to express "absent"
 * as a passing value.
 */

import type { IGovernanceValue } from './governance-contracts';

import type { ILiveValue } from './provider-contracts.interface';

export type {
	ILiveValue,
	ILiveForgeState,
	IReadLiveStateRequest,
	IForgeMutationResult,
	IApplyBranchRuleRequest,
	IApplyRepositorySettingsRequest,
	IForgeProviderAdapter,
} from './provider-contracts.interface';

/** Convenience constructor for a readable live value. */
export const liveValue = (value: IGovernanceValue): ILiveValue => ({
	kind: 'value',
	value,
});

/** Convenience constructor for a property that could not be read. */
export const liveUnreadable = (reason: string): ILiveValue => ({
	kind: 'unreadable',
	reason,
});
