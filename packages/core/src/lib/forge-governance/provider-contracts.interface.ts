/**
 * Contract shapes for `./provider-contracts`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `provider-contracts.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `provider-contracts.ts`, so no import site changes.
 */

import type {
	IForgeProviderId,
	IGovernanceValue,
	IDesiredBranchRule,
	IDesiredRepositorySettings,
	IForgeRepositoryRef,
} from './governance-contracts';

/**
 * One observed property. `unreadable` is what becomes `NOT_EXECUTABLE`:
 * no credential, transport error, unsupported provider, or a field the
 * forge simply does not expose.
 */
export type ILiveValue =
	| { readonly kind: 'value'; readonly value: IGovernanceValue }
	| { readonly kind: 'unreadable'; readonly reason: string };

/**
 * The live snapshot, keyed by the same property ids the desired state
 * uses. A missing key is NOT a pass — the differ reports it as
 * `NOT_EXECUTABLE` with an "adapter did not report" reason.
 */
export interface ILiveForgeState {
	readonly provider: IForgeProviderId;
	readonly properties: Readonly<Record<string, ILiveValue>>;
}

/** What the broker asks an adapter to read. */
export interface IReadLiveStateRequest {
	readonly target: IForgeRepositoryRef;
	readonly branches: readonly string[];
}

/**
 * Outcome of a write. `ok: false` never carries provider credentials or
 * raw response bodies that might echo one back — see `redact-secrets.ts`.
 */
export interface IForgeMutationResult {
	readonly ok: boolean;
	/** Human-readable, already redacted. Empty when `ok`. */
	readonly reason: string;
}

/** Write one branch rule. Whole-object semantics: the rule replaces. */
export interface IApplyBranchRuleRequest {
	readonly target: IForgeRepositoryRef;
	readonly rule: IDesiredBranchRule;
}

/** Write the repository-wide settings. */
export interface IApplyRepositorySettingsRequest {
	readonly target: IForgeRepositoryRef;
	readonly settings: IDesiredRepositorySettings;
}

/**
 * The complete provider surface. GitHub implements it today; a GitLab
 * adapter can follow without the broker learning anything new.
 */
export interface IForgeProviderAdapter {
	readonly provider: IForgeProviderId;
	/** True when this adapter is permitted to perform writes at all. */
	readonly mutationsEnabled: boolean;
	readLiveState(request: IReadLiveStateRequest): Promise<ILiveForgeState>;
	applyBranchRule(
		request: IApplyBranchRuleRequest,
	): Promise<IForgeMutationResult>;
	applyRepositorySettings(
		request: IApplyRepositorySettingsRequest,
	): Promise<IForgeMutationResult>;
}
