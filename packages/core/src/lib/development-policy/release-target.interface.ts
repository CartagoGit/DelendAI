/**
 * Contract shapes for `./release-target`.
 */

/**
 * How a cut release reaches the release branch. `none` means there is no
 * promotion step at all: the project releases from the branch it
 * integrates on.
 */
export type IReleasePromotion = 'none' | 'pull-request' | 'merge' | 'direct';

/** Where a project's release starts, where it lands and what carries its version. */
export interface IReleaseTarget {
	readonly integrationBranch: string;
	readonly releaseBranch: string;
	/** Workspace-relative manifest whose `version` the release bumps. */
	readonly versionManifestPath: string;
	readonly promotion: IReleasePromotion;
}
