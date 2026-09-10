/**
 * index.ts — the public face of the forge-governance broker.
 *
 * It re-exports the four typed operations and the contracts around them,
 * and deliberately re-exports NOTHING that would let a caller reach the
 * forge with an arbitrary request: `github-payloads.ts` is the only place
 * a request body is built, and it can only be built from a policy-derived
 * desired state. Adding an escape hatch would have to start here, which
 * makes its absence reviewable.
 */

export { applyDesiredState, type IApplyInput } from './apply-desired-state';
export {
	buildDesiredState,
	findBranchRule,
	type IBuildDesiredStateOptions,
} from './build-desired-state';
export {
	FORGE_CREDENTIAL_SOURCES,
	type IForgeCredentialSource,
	type IForgeCredentialSeam,
	resolveForgeCredentialSeam,
} from './credential-seam';
export {
	type IGovernanceApplyAction,
	type IGovernanceApplyResult,
	type IGovernanceDiff,
	type IGovernancePropertyDiff,
	type IGovernanceVerification,
	isPassingVerdict,
} from './diff-contracts';
export {
	createGithubForgeAdapter,
	type IGhExec,
	type IGithubAdapterOptions,
} from './github-adapter';
export {
	classifyProtectionFailure,
	type IProtectionFailure,
} from './github-live-read';
export {
	BRANCH_PROPERTIES,
	branchPropertyId,
	type IBranchProperty,
	type IBranchRole,
	FORGE_PROVIDERS,
	type IForgeProviderId,
	GOVERNANCE_STATUSES,
	type IGovernanceScope,
	type IGovernanceStatus,
	type IGovernanceValue,
	type IDesiredApprovals,
	type IDesiredBranchRule,
	type IDesiredForgeState,
	type IDesiredRepositorySettings,
	type IForgeRepositoryRef,
	REPOSITORY_PROPERTIES,
	repositoryPropertyId,
	type IRepositoryProperty,
} from './governance-contracts';
export {
	foldVerdict,
	type IInspectInput,
	inspectDesiredVsLive,
} from './inspect-desired-vs-live';
export {
	type IApplyBranchRuleRequest,
	type IApplyRepositorySettingsRequest,
	type IForgeMutationResult,
	type IForgeProviderAdapter,
	type ILiveForgeState,
	type IReadLiveStateRequest,
	liveUnreadable,
	liveValue,
	type ILiveValue,
} from './provider-contracts';
export {
	type IReconcileInput,
	type IReconcileResult,
	reconcileForgeGovernance,
} from './reconcile';
export { REDACTED, redactSecrets, safeProviderMessage } from './redact-secrets';
export {
	compareStrictness,
	type IStrictnessComparison,
	isStrictlyStronger,
} from './strictness';
export {
	type IVerifyInput,
	verifyDesiredState,
} from './verify-desired-state';
