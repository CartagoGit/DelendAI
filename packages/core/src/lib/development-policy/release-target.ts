/**
 * release-target.ts — the one answer to "what does a release of this
 * project move, from where and to where".
 *
 * WHY: the release tools used to name `develop`, `main` and this
 * repository's `packages/core/package.json`. A project's branches and
 * strategy are its configuration, so the tools read them from the
 * resolved policy instead.
 *
 * WHY promotion is derived: the policy models how work reaches the
 * integration branch, not a second strategy for the release branch, so
 * promotion follows `integration.strategy`. A project with one branch
 * has nothing to promote.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import { hasSeparateReleaseBranch } from './release-branch';
import type {
	IReleasePromotion,
	IReleaseTarget,
} from './release-target.interface';

/** Used when the project names no manifest: the package at its root. */
const DEFAULT_VERSION_MANIFEST_PATH = 'package.json';

const PROMOTION_BY_STRATEGY: Readonly<
	Record<
		IResolvedDevelopmentPolicy['integration']['strategy'],
		IReleasePromotion
	>
> = {
	'pull-request': 'pull-request',
	merge: 'merge',
	direct: 'direct',
};

export const resolveReleasePromotion = (
	policy: IResolvedDevelopmentPolicy,
): IReleasePromotion =>
	hasSeparateReleaseBranch(policy.branches)
		? PROMOTION_BY_STRATEGY[policy.integration.strategy]
		: 'none';

export const resolveReleaseTarget = (
	policy: IResolvedDevelopmentPolicy,
	versionManifestPath: string = DEFAULT_VERSION_MANIFEST_PATH,
): IReleaseTarget =>
	Object.freeze({
		integrationBranch: policy.branches.integration,
		releaseBranch: policy.branches.release,
		versionManifestPath,
		promotion: resolveReleasePromotion(policy),
	});
