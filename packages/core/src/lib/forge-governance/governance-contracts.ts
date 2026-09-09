/**
 * governance-contracts.ts — the vocabulary the forge-governance broker
 * speaks: the tri-state verdict, the property identity scheme and the
 * shape of a desired forge configuration.
 *
 * It exists as its own file because the tri-state is the whole point of
 * this subsystem and must be impossible to bypass. A gate that reports
 * `PASS` for a property it could not actually read is worse than no gate
 * at all, so `NOT_EXECUTABLE` is a first-class member of the result type
 * rather than an optional field somebody can forget to inspect. Types
 * only — no I/O, no policy derivation, no provider knowledge.
 */

import type {
	IntegrationStrategy,
	MergeMethod,
} from '../contracts/interfaces/development-policy.interface';

/**
 * The only three outcomes a governance property may have.
 *
 * - `PASS` — the live value was READ and it matches the desired value.
 * - `FAIL` — the live value was READ and it does not match.
 * - `NOT_EXECUTABLE` — the live value could NOT be read (no credential,
 *   API error, unsupported provider, property not reported). This is
 *   never a pass; consumers must treat it as a failure unless the
 *   property is explicitly declared not-applicable for the policy.
 */
export const GOVERNANCE_STATUSES = ['PASS', 'FAIL', 'NOT_EXECUTABLE'] as const;
export type GovernanceStatus = (typeof GOVERNANCE_STATUSES)[number];

/** Forge vendors this broker can have an adapter for. */
export const FORGE_PROVIDERS = ['github', 'gitlab'] as const;
export type ForgeProviderId = (typeof FORGE_PROVIDERS)[number];

/** Which half of the desired state a property belongs to. */
export type GovernanceScope = 'repository' | 'branch';

/** What a branch is FOR, which is what decides how strict it must be. */
export type BranchRole = 'integration' | 'release';

/** The value types a governance property can carry. */
export type GovernanceValue = boolean | number | readonly string[];

/** Branch-scoped properties, in a fixed order so diffs are stable. */
export const BRANCH_PROPERTIES = [
	'requirePullRequest',
	'requiredApprovingReviews',
	'requiredChecks',
	'requireChecksUpToDate',
	'requireLinearHistory',
	'allowForcePush',
	'allowDeletion',
	'requireConversationResolution',
	'enforceAdmins',
] as const;
export type BranchProperty = (typeof BRANCH_PROPERTIES)[number];

/** Repository-scoped properties, in a fixed order. */
export const REPOSITORY_PROPERTIES = [
	'allowSquashMerge',
	'allowMergeCommit',
	'allowRebaseMerge',
	'deleteBranchOnMerge',
] as const;
export type RepositoryProperty = (typeof REPOSITORY_PROPERTIES)[number];

/** Stable id for a repository property, e.g. `repository.deleteBranchOnMerge`. */
export const repositoryPropertyId = (property: RepositoryProperty): string =>
	`repository.${property}`;

/** Stable id for a branch property, e.g. `branch.develop.requirePullRequest`. */
export const branchPropertyId = (
	branch: string,
	property: BranchProperty,
): string => `branch.${branch}.${property}`;

/**
 * The protection shape one branch must have. Every field is derived from
 * `IResolvedDevelopmentPolicy`; nothing here is read from the forge, from
 * a repository name or from an environment variable.
 */
export interface IDesiredBranchRule {
	readonly branch: string;
	readonly role: BranchRole;
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
	readonly mergeMethod: MergeMethod;
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
	readonly integrationStrategy: IntegrationStrategy;
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
