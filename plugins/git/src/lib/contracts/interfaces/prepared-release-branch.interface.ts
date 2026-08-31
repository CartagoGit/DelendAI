import type { ReleaseType } from '@mcp-vertex/core/public';

/**
 * Outcome of `prepareReleaseBranch`: the canonical release branch was
 * either created or reused from a clean `develop` checkout, and its
 * upstream is configured on the given remote (default `origin`).
 */
export interface IPreparedReleaseBranch {
	readonly branch: string;
	readonly baseBranch: 'develop';
	readonly sourceSha: string;
	readonly upstream: string;
}

/** Minimal input for `prepareReleaseBranch`. */
export interface IPrepareReleaseBranchInput {
	readonly type: ReleaseType;
	readonly slug: string;
}
