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
	IBranchProperty,
	IRepositoryProperty,
} from './governance-contracts.interface';

export type {
	IGovernanceStatus,
	IForgeProviderId,
	IGovernanceScope,
	IBranchRole,
	IGovernanceValue,
	IBranchProperty,
	IRepositoryProperty,
	IDesiredBranchRule,
	IDesiredApprovals,
	IDesiredRepositorySettings,
	IDesiredForgeState,
	IForgeRepositoryRef,
} from './governance-contracts.interface';
export {
	GOVERNANCE_STATUSES,
	FORGE_PROVIDERS,
	BRANCH_PROPERTIES,
	REPOSITORY_PROPERTIES,
} from './governance-contracts.constant';

/** Stable id for a repository property, e.g. `repository.deleteBranchOnMerge`. */
export const repositoryPropertyId = (property: IRepositoryProperty): string =>
	`repository.${property}`;

/** Stable id for a branch property, e.g. `branch.develop.requirePullRequest`. */
export const branchPropertyId = (
	branch: string,
	property: IBranchProperty,
): string => `branch.${branch}.${property}`;
