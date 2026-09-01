/**
 * Release-cycle configuration. The two parameters the plugin always
 * documents (and any host can override) are the branches the release
 * flow touches:
 *
 *   - `releaseSourceBranch`     default `develop`
 *   - `releaseTargetBranch`     default `main`
 *   - `integrationBranch`       default `develop`
 *   - `remote`                  default `origin`
 *
 * PRs in this repository (and by default in any repository using the
 * `forge` plugin) MUST originate on `release/**` and target
 * `releaseTargetBranch` — never `integrationBranch`. Hydrating
 * `integrationBranch` from the release branch is a separate
 * `rehydrateIntegrationFromRelease` operation that pushes the same
 * commits to the integration branch without opening a PR.
 */
export interface IReleaseCycleConfig {
	readonly releaseSourceBranch: string;
	readonly releaseTargetBranch: string;
	readonly integrationBranch: string;
	readonly remote: string;
}

/** Defaults applied when the host does not override them. */
export const DEFAULT_RELEASE_CYCLE_CONFIG: IReleaseCycleConfig = Object.freeze({
	releaseSourceBranch: 'develop',
	releaseTargetBranch: 'main',
	integrationBranch: 'develop',
	remote: 'origin',
});

/**
 * Result of `mergeReleaseFixToIntegration`: the release branch's
 * fixups were integrated into the configured `integrationBranch`
 * and pushed to the remote.
 */
export interface IReleaseFixMerged {
	readonly releaseBranch: string;
	readonly integrationBranch: string;
	readonly integrationSha: string;
	readonly mergeCommit?: string;
	readonly strategy: 'ff' | 'no-ff';
	readonly upstream: string;
}

/** Input for `mergeReleaseFixToIntegration`. */
export interface IMergeReleaseFixInput {
	readonly releaseBranch: string;
	readonly fastForwardOnly?: boolean;
}

/**
 * Result of `rehydrateIntegrationFromRelease`: after the release PR
 * merged into `releaseTargetBranch`, the same commit range was
 * replayed (rebase or merge) onto `integrationBranch` and pushed.
 * No pull request is opened; the operation is the only sanctioned
 * way to keep `integrationBranch` in sync with the release branch
 * without leaving PRs against it.
 */
export interface IIntegrationRehydrated {
	readonly releaseBranch: string;
	readonly integrationBranch: string;
	readonly integrationSha: string;
	readonly strategy: 'rebase' | 'merge';
	readonly upstream: string;
}

/** Input for `rehydrateIntegrationFromRelease`. */
export interface IRehydrateIntegrationInput {
	readonly releaseBranch: string;
	readonly strategy?: 'rebase' | 'merge';
}

/**
 * Result of `openPromotionPr`: the prepared release branch was pushed
 * to its upstream and is ready for the human / provider to open the
 * PR toward the configured `releaseTargetBranch`.
 */
export interface IPromotionReady {
	readonly branch: string;
	readonly headSha: string;
	readonly upstream: string;
	readonly baseBranch: string;
}
