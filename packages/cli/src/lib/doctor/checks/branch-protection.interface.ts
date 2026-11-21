import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

/** The slice of the policy the branch-protection check reads. */
export type IBranchProtectionPolicy = Pick<
	IResolvedDevelopmentPolicy,
	'branches' | 'integration' | 'governance'
>;
