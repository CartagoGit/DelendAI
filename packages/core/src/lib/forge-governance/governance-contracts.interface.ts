/**
 * Contract shapes for `./governance-contracts`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `governance-contracts.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `governance-contracts.ts`, so no import site changes.
 */

import type {
	IIntegrationStrategy,
	IMergeMethod,
} from '../contracts/interfaces/development-policy.interface';
import type {
	BRANCH_PROPERTIES,
	FORGE_PROVIDERS,
	GOVERNANCE_STATUSES,
	REPOSITORY_PROPERTIES,
} from './governance-contracts.constant';

export type IGovernanceStatus = (typeof GOVERNANCE_STATUSES)[number];

export type IForgeProviderId = (typeof FORGE_PROVIDERS)[number];

/** Which half of the desired state a property belongs to. */
export type IGovernanceScope = 'repository' | 'branch';

/** What a branch is FOR, which is what decides how strict it must be. */
export type IBranchRole = 'integration' | 'release';

/** The value types a governance property can carry. */
export type IGovernanceValue = boolean | number | readonly string[];

export type IBranchProperty = (typeof BRANCH_PROPERTIES)[number];

export type IRepositoryProperty = (typeof REPOSITORY_PROPERTIES)[number];

/**
 * The protection shape one branch must have. Every field is derived from
 * `IResolvedDevelopmentPolicy`; nothing here is read from the forge, from
 * a repository name or from an environment variable.
 */
export interface IDesiredBranchRule {
	readonly branch: string;
	readonly role: IBranchRole;
	readonly requirePullRequest: boolean;
	readonly requiredApprovingReviews: number;
	readonly requiredChecks: readonly string[];
	/** The forge's "strict"/up-to-date-with-base gate. */
	readonly requireChecksUpToDate: boolean;
	readonly requireLinearHistory: boolean;
	readonly allowForcePush: boolean;
	readonly allowDeletion: boolean;
	readonly requireConversationResolution: boolean;
	/** Whether the rule also binds repository administrators. */
	readonly enforceAdmins: boolean;
}

/**
 * How many approving reviews each branch role requires.
 *
 * It is a field rather than a constant because the number is a POLICY
 * decision, not a forge fact. A project whose agents integrate
 * autonomously when CI is green requires zero human approvals on every
 * branch, and a governance broker that hardcoded "the release branch
 * needs one" would report a permanent, unfixable FAIL against a
 * deliberately correct configuration. Zero is therefore the default, so
 * autonomous operation is representable without an override.
 */
export interface IDesiredApprovals {
	readonly integration: number;
	readonly release: number;
}

/** Repository-wide settings the policy pins. */
export interface IDesiredRepositorySettings {
	readonly mergeMethod: IMergeMethod;
	readonly allowSquashMerge: boolean;
	readonly allowMergeCommit: boolean;
	readonly allowRebaseMerge: boolean;
	readonly deleteBranchOnMerge: boolean;
}

/**
 * The complete desired forge configuration for one repository.
 *
 * `notApplicable` carries the property ids this policy explicitly does
 * NOT govern (e.g. required check contexts when the policy names none, so
 * the forge decides). It is the ONLY sanctioned way for a property to be
 * excluded from the verdict — anything absent from this list and not
 * readable is `NOT_EXECUTABLE`.
 */
export interface IDesiredForgeState {
	readonly policyProfile: string;
	readonly integrationStrategy: IIntegrationStrategy;
	/** True when the runtime may WRITE, not merely report drift. */
	readonly enforced: boolean;
	/** True when unverifiable properties must fail the gate. */
	readonly failClosedOnUnverifiable: boolean;
	readonly repository: IDesiredRepositorySettings;
	/** The approval counts this state was derived with, surfaced for audit. */
	readonly approvals: IDesiredApprovals;
	readonly branches: readonly IDesiredBranchRule[];
	readonly notApplicable: readonly string[];
}

/** Identifies the repository a broker call acts on. */
export interface IForgeRepositoryRef {
	readonly owner: string;
	readonly repository: string;
}
